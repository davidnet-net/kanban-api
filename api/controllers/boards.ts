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
    if (boards === undefined || boards === null) {
        boards = [];
    }
    ctx.response.body = boards;
};