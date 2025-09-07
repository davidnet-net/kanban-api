import { Context } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import getDBClient from "../lib/db.ts";
import { verifyJWT } from "../lib/jwt.ts";

export const get_cards = async (ctx: Context) => {
    const body = await ctx.request.body({ type: "json" }).value;
    const listId = Number(body.list_id);
    if (isNaN(listId) || listId <= 0) return ctx.throw(400, "Invalid list id");

    const client = await getDBClient();
    if (!client) return ctx.throw(500, "DB error");

    const listResult = await client.query("SELECT board_id FROM lists WHERE id = ?", [listId]);
    const list = listResult[0];
    if (!list) return ctx.throw(404, "List not found");

    const boardResult = await client.query("SELECT * FROM boards WHERE id = ?", [list.board_id]);
    const board = boardResult[0];
    if (!board) return ctx.throw(404, "Board not found");

    if (!board.is_public) {
        const authHeader = ctx.request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) return ctx.throw(401, "Unauthorized");

        let payload;
        try {
            payload = await verifyJWT(authHeader.slice(7));
        } catch {
            return ctx.throw(401, "Invalid token");
        }

        const userId = payload.userId;
        if (board.owner !== userId) {
            const membership = await client.query(
                "SELECT id FROM board_members WHERE board_id = ? AND user_id = ?",
                [board.id, userId]
            );
            if (membership.length === 0) return ctx.throw(403, "Forbidden");
        }
    }

    const cards = await client.query("SELECT * FROM cards WHERE list_id = ? ORDER BY created_at ASC", [listId]);
    ctx.response.body = cards;
};

/**
 * Adds a new list to a board.
 * Only the board owner or members can add lists.
 */
export const add_list = async (ctx: Context) => {
    const body = await ctx.request.body({ type: "json" }).value;
    const boardId = Number(body.board_id);
    const name = body.name?.trim();

    if (isNaN(boardId) || boardId <= 0) return ctx.throw(400, "Invalid board id");
    if (!name) return ctx.throw(400, "List name is required");

    const client = await getDBClient();
    if (!client) return ctx.throw(500, "DB error");

    // Check board existence
    const boardResult = await client.query("SELECT * FROM boards WHERE id = ?", [boardId]);
    const board = boardResult[0];
    if (!board) return ctx.throw(404, "Board not found");

    // Authorization: must be owner or member
    const userId = ctx.state.session.userId;
    if (board.owner !== userId) {
        const membership = await client.query(
            "SELECT id FROM board_members WHERE board_id = ? AND user_id = ?",
            [board.id, userId]
        );
        if (membership.length === 0) return ctx.throw(403, "Forbidden");
    }

    // Determine the next position (end of list)
    const positionResult = await client.query(
        "SELECT MAX(position) as maxPos FROM lists WHERE board_id = ?",
        [boardId]
    );
    const maxPos = positionResult[0]?.maxPos ?? 0;
    const newPosition = (maxPos ?? 0) + 1;

    // Insert new list
    try {
        const result = await client.execute(
            "INSERT INTO lists (name, position, board_id) VALUES (?, ?, ?)",
            [name, newPosition, boardId]
        );
        const newListId = result.lastInsertId;

        const newList = await client.query("SELECT * FROM lists WHERE id = ?", [newListId]);
        ctx.response.status = 201;
        ctx.response.body = newList[0];
    } catch (err) {
        console.error(err);
        ctx.throw(500, "Failed to create list");
    }
};

/**
 * Reorders lists on a board.
 * Expects body:
 * {
 *   board_id: 123,
 *   lists: [
 *     { id: 1, position: 1 },
 *     { id: 3, position: 2 },
 *     { id: 2, position: 3 }
 *   ]
 * }
 */
export const move_list = async (ctx: Context) => {
    const body = await ctx.request.body({ type: "json" }).value;
    const boardId = Number(body.board_id);
    const listsToMove = body.lists;

    if (isNaN(boardId) || boardId <= 0) return ctx.throw(400, "Invalid board id");
    if (!Array.isArray(listsToMove) || listsToMove.length === 0) return ctx.throw(400, "Lists are required");

    const client = await getDBClient();
    if (!client) return ctx.throw(500, "DB error");

    // Check board existence
    const boardResult = await client.query("SELECT * FROM boards WHERE id = ?", [boardId]);
    const board = boardResult[0];
    if (!board) return ctx.throw(404, "Board not found");

    // Authorization: must be owner or member
    const userId = ctx.state.session.userId;
    if (board.owner !== userId) {
        const membership = await client.query(
            "SELECT id FROM board_members WHERE board_id = ? AND user_id = ?",
            [board.id, userId]
        );
        if (membership.length === 0) return ctx.throw(403, "Forbidden");
    }

    try {
        // Update each list's position
        for (const list of listsToMove) {
            const listId = Number(list.id);
            const pos = Number(list.position);
            if (isNaN(listId) || isNaN(pos)) continue;

            await client.execute(
                "UPDATE lists SET position = ? WHERE id = ? AND board_id = ?",
                [pos, listId, boardId]
            );
        }

        ctx.response.status = 200;
        ctx.response.body = { message: "Lists reordered successfully" };
    } catch (err) {
        console.error(err);
        ctx.throw(500, "Failed to reorder lists");
    }
};
