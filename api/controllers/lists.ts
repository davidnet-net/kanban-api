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
