import { Context } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { getDBClient } from "../lib/db.ts";

export const list_boards = async (ctx: Context) => {
    const client = await getDBClient();
    if (!client) {
        ctx.response.status = 500;
        ctx.response.body = { error: "Database error" };
        return;
    }

    let boards = await client.query("SELECT * FROM boards WHERE owner = ?", [ctx.state.session.userId]);
    if (!boards) boards = [];
    ctx.response.body = boards;
};

export const favorite_boards = async (ctx: Context) => {
    const client = await getDBClient();
    if (!client) {
        ctx.response.status = 500;
        ctx.response.body = { error: "Database error" };
        return;
    }

    // Get favorite board IDs
    const favRows = await client.query(
        "SELECT board_id FROM favorite_boards WHERE user_id = ?",
        [ctx.state.session.userId]
    );

    const boardIds = (favRows ?? []).map((row: any) => row.board_id);
    let boards = [];

    if (boardIds.length > 0) {
        // Fetch full board info
        const placeholders = boardIds.map(() => "?").join(",");
        boards = await client.query(
            `SELECT * FROM boards WHERE id IN (${placeholders})`,
            boardIds
        );
    }

    ctx.response.body = boards;
};

export const recent_boards = async (ctx: Context) => {
    const client = await getDBClient();
    if (!client) {
        ctx.response.status = 500;
        ctx.response.body = { error: "Database error" };
        return;
    }

    // Get the 5 most recent unique board IDs
    const recentRows = await client.query(
        `SELECT board_id
         FROM recent_boards
         WHERE user_id = ?
         GROUP BY board_id
         ORDER BY MAX(created_at) DESC
         LIMIT 4`,
        [ctx.state.session.userId]
    );

    const boardIds = (recentRows ?? []).map((row: any) => row.board_id);
    let boards = [];

    if (boardIds.length > 0) {
        const placeholders = boardIds.map(() => "?").join(",");
        const rows = await client.query(
            `SELECT * FROM boards WHERE id IN (${placeholders})`,
            boardIds
        );

        // Preserve the order of boardIds
        const boardMap = new Map(rows.map((b: any) => [b.id, b]));
        boards = boardIds.map((id: any) => boardMap.get(id));
    }

    ctx.response.body = boards;
};

