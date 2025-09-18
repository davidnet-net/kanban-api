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
    if (!board) {
        ctx.response.status = 404;
        ctx.response.body = { "error": "Board not found" }
        return;
    }

    console.log("Public: " + board.is_public);
    let payload;
    try {
        const authHeader = ctx.request.headers.get("authorization");
        console.log(authHeader);
        if (!authHeader?.startsWith("Bearer ")) return ctx.throw(401, "Unauthorized");

        payload = await verifyJWT(authHeader.slice(7));
    } catch {
        if (board.is_public) {
            ctx.response.body = board;
            return;
        } else {
            return ctx.throw(401, "Invalid token");
        }
    }

    try {
        await client.execute(
            "INSERT INTO recent_boards (user_id, board_id) VALUES (?, ?)",
            [payload.userId, id]
        );
        ctx.response.status = 201;
    } catch (err) {
        console.error(err);
        ctx.throw(500, "Failed to create card");
    }

    if (board.is_public) {
        ctx.response.body = board;
        return;
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

    if (membership.length === 0) {
        ctx.response.status = 403;
        ctx.response.body = { "error": "Not board member" }
        return;
    }
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

export const favorite_board = async (ctx: Context) => {
    const body = await ctx.request.body({ type: "json" }).value;
    const board_id = Number(body.board_id);

    if (isNaN(board_id) || board_id <= 0) return ctx.throw(400, "Invalid list id");

    const client = await getDBClient();
    if (!client) return ctx.throw(500, "DB error");

    // Check list exists
    const boards = await client.query("SELECT id FROM boards WHERE id = ?", [board_id]);
    const board = boards[0];
    if (!board) return ctx.throw(404, "Board not found");

    try {
        const result = await client.query(
            "SELECT 1 FROM favorite_boards WHERE user_id = ? AND board_id = ? LIMIT 1",
            [ctx.state.session.userId, board_id]
        );

        if (result.length > 1) {
            ctx.response.status = 400;
            ctx.response.body = { error: "Already favorited" }
            return;
        }

        await client.execute(
            "INSERT INTO favorite_boards (user_id, board_id) VALUES (?, ?)",
            [ctx.state.session.userId, board_id]
        );
        ctx.response.status = 201;
        ctx.response.body = { ok: true }
    } catch (err) {
        console.error(err);
        ctx.throw(500, "Failed to create favorite");
    }
};


export const unfavorite_board = async (ctx: Context) => {
    const body = await ctx.request.body({ type: "json" }).value;
    const board_id = Number(body.board_id);

    if (isNaN(board_id) || board_id <= 0) return ctx.throw(400, "Invalid board id");

    const client = await getDBClient();
    if (!client) return ctx.throw(500, "DB error");

    // Check if board exists
    const boards = await client.query("SELECT id FROM boards WHERE id = ?", [board_id]);
    const board = boards[0];
    if (!board) return ctx.throw(404, "Board not found");

    try {
        await client.execute(
            "DELETE FROM favorite_boards WHERE user_id = ? AND board_id = ?",
            [ctx.state.session.userId, board_id]
        );


        ctx.response.status = 200;
        ctx.response.body = { ok: true }
    } catch (err) {
        console.error(err);
        ctx.throw(500, "Failed to remove favorite");
    }
};


export const is_favorited = async (ctx: Context) => {
    const body = await ctx.request.body({ type: "json" }).value;
    const board_id = Number(body.board_id);

    if (isNaN(board_id) || board_id <= 0) return ctx.throw(400, "Invalid board id");

    const client = await getDBClient();
    if (!client) return ctx.throw(500, "DB error");

    try {
        const result = await client.query(
            "SELECT 1 FROM favorite_boards WHERE user_id = ? AND board_id = ? LIMIT 1",
            [ctx.state.session.userId, board_id]
        );

        ctx.response.status = 200;
        ctx.response.body = { favorited: result.length > 0 };
    } catch (err) {
        console.error(err);
        ctx.throw(500, "Failed to check favorite");
    }
};

export const delete_board = async (ctx: Context) => {
    const body = await ctx.request.body({ type: "json" }).value;
    const boardId = Number(body.board_id);

    if (isNaN(boardId) || boardId <= 0) return ctx.throw(400, "Invalid board id");

    const client = await getDBClient();
    if (!client) return ctx.throw(500, "DB error");

    // Get board and verify ownership
    const boardResult = await client.query("SELECT owner FROM boards WHERE id = ?", [boardId]);
    const board = boardResult[0];
    if (!board) return ctx.throw(404, "Board not found");

    const userId = ctx.state.session.userId;
    if (board.owner !== userId) return ctx.throw(403, "Only the owner can delete this board");

    try {
        await client.execute("DELETE FROM boards WHERE id = ?", [boardId]);

        ctx.response.status = 200;
        ctx.response.body = { ok: true, message: "Board deleted successfully" };
    } catch (err) {
        console.error(err);
        ctx.throw(500, "Failed to delete board");
    }
};

export const edit_board = async (ctx: Context) => {
    const body = await ctx.request.body({ type: "json" }).value;
    const boardId = Number(body.board_id);
    const name = body.name?.trim();
    const isPublic = Boolean(body.is_public);

    if (isNaN(boardId) || boardId <= 0) return ctx.throw(400, "Invalid board id");
    if (!name || name.length > 20 || /[^a-zA-Z0-9 ]/.test(name)) {
        return ctx.throw(400, "Invalid board name");
    }

    const client = await getDBClient();
    if (!client) return ctx.throw(500, "DB error");

    // Get board and verify ownership
    const boardResult = await client.query("SELECT owner FROM boards WHERE id = ?", [boardId]);
    const board = boardResult[0];
    if (!board) return ctx.throw(404, "Board not found");

    const userId = ctx.state.session.userId;
    if (board.owner !== userId) return ctx.throw(403, "Only the owner can edit this board");

    try {
        await client.execute(
            "UPDATE boards SET name = ?, is_public = ? WHERE id = ?",
            [name, isPublic ? 1 : 0, boardId]
        );

        ctx.response.status = 200;
        ctx.response.body = { ok: true, id: boardId, name, is_public: isPublic };
    } catch (err) {
        console.error(err);
        ctx.throw(500, "Failed to update board");
    }
};
