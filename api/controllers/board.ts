import { Context } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { getDBClient } from "../lib/db.ts";
import { verifyJWT } from "../lib/jwt.ts";

export const get_board = async (ctx: Context) => {
    const body = await ctx.request.body({ type: "json" }).value;

    const id = Number(body.id);
    if (isNaN(id) || id <= 0) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Invalid board id. Must be a number > 0." };
        return;
    }

    const client = await getDBClient();
    if (!client) {
        ctx.response.status = 500;
        ctx.response.body = { error: "Database error" };
        return;
    }

    const result = await client.query("SELECT * FROM boards WHERE id = ?", [id]);
    const board = result[0];
    if (!board) {
        ctx.response.status = 404;
        ctx.response.body = { error: "Board not found" };
        return;
    }

    // Public board
    if (board.is_public) {
        ctx.response.body = board;
        return;
    }

    // Check Authorization header
    const authHeader = ctx.request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
        ctx.response.status = 401;
        ctx.response.body = { error: "Unauthorized" };
        return;
    }

    let payload;
    try {
        const token = authHeader.slice(7);
        console.log(token);
        payload = await verifyJWT(token);
    } catch {
        ctx.response.status = 401;
        ctx.response.body = { error: "Invalid token" };
        return;
    }

    const userId = payload.userId;

    // Owner check
    if (board.owner === userId) {
        ctx.response.body = board;
        return;
    }

    // Membership check
    const membershipResult = await client.query(
        "SELECT * FROM board_members WHERE board_id = ? AND user_id = ?",
        [id, userId]
    );

    if (membershipResult.rows.length === 0) {
        ctx.response.status = 403;
        ctx.response.body = { error: "Forbidden: You are not a member of this board" };
        return;
    }

    ctx.response.body = board;
};

export const am_i_member = async (ctx: Context) => {
    const body = await ctx.request.body({ type: "json" }).value;

    const id = Number(body.id);
    if (isNaN(id) || id <= 0) {
        ctx.response.status = 400;
        ctx.response.body = { result: false, error: "Invalid board id. Must be a number > 0." };
        return;
    }

    const authHeader = ctx.request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
        ctx.response.status = 401;
        ctx.response.body = { result: false, error: "Unauthorized" };
        return;
    }

    let payload;
    try {
        const token = authHeader.slice(7);
        payload = await verifyJWT(token);
    } catch {
        ctx.response.status = 401;
        ctx.response.body = { result: false, error: "Invalid token" };
        return;
    }

    const userId = payload.userId;

    const client = await getDBClient();
    if (!client) {
        ctx.response.status = 500;
        ctx.response.body = { result: false, error: "Database error" };
        return;
    }

    // Check if board exists and get owner
    const boardResult = await client.query("SELECT owner FROM boards WHERE id = ?", [id]);
    const board = boardResult[0];
    if (!board) {
        ctx.response.status = 404;
        ctx.response.body = { result: false, error: "Board not found" };
        return;
    }

    // Owner check
    if (board.owner === userId) {
        ctx.response.body = { result: true };
        return;
    }

    // Membership check
    const membershipResult = await client.query(
        "SELECT id FROM board_members WHERE board_id = ? AND user_id = ?",
        [id, userId]
    );

    if (membershipResult.length > 0) {
        ctx.response.body = { result: true };
    } else {
        ctx.response.body = { result: false };
    }
};

export const create_board = async (ctx: Context) => {
    const body = await ctx.request.body({ type: "json" }).value;

    const name = body.name?.trim();
    const isPublic = Boolean(body.is_public);
    const backgroundUrl = body.background_url?.trim();

    if (!name || name.length === 0) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Board name is required" };
        return;
    }

    if (!backgroundUrl || backgroundUrl.length === 0) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Background URL is required" };
        return;
    }

    const userId = ctx.state.session.userId;

    const client = await getDBClient();
    if (!client) {
        ctx.response.status = 500;
        ctx.response.body = { error: "Database error" };
        return;
    }

    try {
        const result = await client.execute(
            "INSERT INTO boards (name, owner, is_public, background_url) VALUES (?, ?, ?, ?)",
            [name, userId, isPublic ? 1 : 0, backgroundUrl]
        );

        const newBoardId = result.lastInsertId;

        // Optionally, add the owner to the board_members table as 'owner'
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
        console.error("Failed to create board:", err);
        ctx.response.status = 500;
        ctx.response.body = { error: "Failed to create board" };
    }
};