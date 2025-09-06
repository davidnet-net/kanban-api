import { Middleware } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import getDBClient from "../lib/db.ts";
import { verifyJWT } from "../lib/jwt.ts";
import { log_error } from "../lib/logger.ts";

export const auth: Middleware = async (ctx, next) => {
	const authHeader = ctx.request.headers.get("authorization");
	if (!authHeader?.startsWith("Bearer ")) {
		ctx.response.status = 401;
		ctx.response.body = { error: "Unauthorized" };
		return;
	}

	let userId: number;
	let jwtID: string;
	try {
		const token = authHeader.slice(7);
		const payload = await verifyJWT(token);
		console.log(payload);
		console.log(payload.jti);
		userId = Number(payload.userId);
		jwtID = String(payload.jti);
	} catch {
		ctx.response.status = 401;
		ctx.response.body = { error: "Invalid token" };
		return;
	}

	// Get the DB after validating
	const client = await getDBClient();
	if (!client) {
		log_error(
			"Auth middlewere error: DATABASE CONNECTION ERR",
			ctx.state.correlationID,
		);
		ctx.response.status = 500;
		ctx.response.body = { error: "Database connection error." };
		return;
	}

	const session = await client.execute(
		`SELECT id FROM sessions WHERE user_id = ? AND jwt_id = ?`,
		[userId, jwtID],
	);


	if (!session.rows || session.rows.length < 1) {
		ctx.response.status = 401;
		ctx.response.body = { error: "Session NOT found." };
	}
	ctx.state.session = session;
	await next();
};

export default auth;
