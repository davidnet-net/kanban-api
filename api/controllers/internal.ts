import { Context } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import getDBClient from "../lib/db.ts";

export const user_creation = async (ctx: Context) => {
    try {
        const body = await ctx.request.body({ type: "json" }).value;
        const user_id = Number(body.user_id);
        const jwt_token = String(body.jwt_token);

        if (Deno.env.get("DA_JWT_SECRET") !== jwt_token) {
            return ctx.throw(400, "Invalid jwt_token");
        }

        if (isNaN(user_id) || user_id <= 0) {
            return ctx.throw(400, "Invalid user_id");
        }

        const client = await getDBClient();
        if (!client) return ctx.throw(500, "DB connection error");

        // Check if user already exists
        const existingUser = await client.query(
            "SELECT user_id FROM users WHERE user_id = ?",
            [user_id]
        );
        if (existingUser.length > 0) {
            return ctx.throw(409, "User already exists");
        }

        // Insert user
        await client.execute(
            "INSERT INTO users (user_id) VALUES (?)",
            [user_id]
        );

        ctx.response.status = 201;
        ctx.response.body = { message: "User created", user_id };
    } catch (err) {
        console.error("user_creation error:", err);
        ctx.throw(500, "Failed to create user");
    }
};

export const user_deletion = async (ctx: Context) => {
    try {
        const body = await ctx.request.body({ type: "json" }).value;
        const user_id = Number(body.user_id);
        const jwt_token = String(body.jwt_token);

        if (Deno.env.get("DA_JWT_SECRET") !== jwt_token) {
            return ctx.throw(400, "Invalid jwt_token");
        }

        if (isNaN(user_id) || user_id <= 0) {
            return ctx.throw(400, "Invalid user_id");
        }

        const client = await getDBClient();
        if (!client) return ctx.throw(500, "DB connection error");

        // Check if user exists
        const existingUser = await client.query(
            "SELECT user_id FROM users WHERE user_id = ?",
            [user_id]
        );
        if (existingUser.length === 0) {
            return ctx.throw(404, "User not found");
        }

        await client.execute("DELETE FROM users WHERE user_id = ?", [user_id]);

        ctx.response.status = 200;
        ctx.response.body = { message: "User deleted", user_id };
    } catch (err) {
        console.error("user_deletion error:", err);
        ctx.throw(500, "Failed to delete user");
    }
};
