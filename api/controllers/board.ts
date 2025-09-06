import { Context } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { getDBClient } from "../lib/db.ts";
import { verifyJWT } from "../lib/jwt.ts";

export const get_board = async (ctx: Context) => {
    const body = await ctx.request.body({ type: "json" }).value;
    const id = Number(body.id);
    if (isNaN(id) || id <= 0) return ctx.throw(400, "Invalid board id");

    const client = await getDBClient();
    if (!client) return ctx.throw(500, "DB error");

    const result = await client.query("SELECT * FROM boards WHERE id = ?", [id]);
    const board = result[0];
    if (!board) return ctx.throw(404, "Board not found");

    if (board.is_public) {
        ctx.response.body = board;
        return;
    }

    const authHeader = ctx.request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) return ctx.throw(401, "Unauthorized");

    let payload;
    try {
        payload = await verifyJWT(authHeader.slice(7));
    } catch {
        return ctx.throw(401, "Invalid token");
    }

    const userId = payload.userId;
    if (board.owner === userId) {
        ctx.response.body = board;
        return;
    }

    const membership = await client.query(
        "SELECT * FROM board_members WHERE board_id = ? AND user_id = ?",
        [id, userId]
    );

    if (membership.length === 0) return ctx.throw(403, "Forbidden");
    ctx.response.body = board;
};

export const am_i_member = async (ctx: Context) => {
    const body = await ctx.request.body({ type: "json" }).value;
    const id = Number(body.id);
    if (isNaN(id) || id <= 0) return ctx.throw(400, "Invalid board id");

    const authHeader = ctx.request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) return ctx.throw(401, "Unauthorized");

    let payload;
    try {
        payload = await verifyJWT(authHeader.slice(7));
    } catch {
        return ctx.throw(401, "Invalid token");
    }

    const userId = payload.userId;
    const client = await getDBClient();
    if (!client) return ctx.throw(500, "DB error");

    const boardResult = await client.query("SELECT owner FROM boards WHERE id = ?", [id]);
    const board = boardResult[0];
    if (!board) return ctx.throw(404, "Board not found");

    if (board.owner === userId) {
        ctx.response.body = { result: true };
        return;
    }

    const membershipResult = await client.query(
        "SELECT id FROM board_members WHERE board_id = ? AND user_id = ?",
        [id, userId]
    );

    ctx.response.body = { result: membershipResult.length > 0 };
};

export const create_board = async (ctx: Context) => {
    const body = await ctx.request.body({ type: "json" }).value;
    const name = body.name?.trim();
    const isPublic = Boolean(body.is_public);
    const backgroundUrl = body.background_url?.trim();

    if (!name || !backgroundUrl) return ctx.throw(400, "Name and background URL required");

    const userId = ctx.state.session.userId;
    const client = await getDBClient();
    if (!client) return ctx.throw(500, "DB error");

    try {
        const result = await client.execute(
            "INSERT INTO boards (name, owner, is_public, background_url) VALUES (?, ?, ?, ?)",
            [name, userId, isPublic ? 1 : 0, backgroundUrl]
        );

        const newBoardId = result.lastInsertId;
        await client.execute(
            "INSERT INTO board_members (user_id, board_id, role) VALUES (?, ?, 'owner')",
            [userId, newBoardId]
        );

        ctx.response.status = 201;
        ctx.response.body = { 
            id: newBoardId,
            name,
            owner: userId,
            is_public: isPublic,
            background_url: backgroundUrl
        };
    } catch (err) {
        console.error(err);
        ctx.throw(500, "Failed to create board");
    }
};

export const get_lists = async (ctx: Context) => {
    const body = await ctx.request.body({ type: "json" }).value;
    const boardId = Number(body.board_id);
    if (isNaN(boardId) || boardId <= 0) return ctx.throw(400, "Invalid board id");

    const client = await getDBClient();
    if (!client) return ctx.throw(500, "DB error");

    const boardResult = await client.query("SELECT * FROM boards WHERE id = ?", [boardId]);
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
                [boardId, userId]
            );
            if (membership.length === 0) return ctx.throw(403, "Forbidden");
        }
    }

    const lists = await client.query("SELECT * FROM lists WHERE board_id = ? ORDER BY position ASC", [boardId]);
    ctx.response.body = lists;
};

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
