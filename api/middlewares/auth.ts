import { Middleware } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { verifyJWT } from "../lib/jwt.ts";

export const auth: Middleware = async (ctx, next) => {
	const authHeader = ctx.request.headers.get("authorization");
	if (!authHeader?.startsWith("Bearer ")) {
		ctx.response.status = 401;
		ctx.response.body = { error: "Unauthorized" };
		return;
	}

	try {
		const token = authHeader.slice(7);
		const payload = await verifyJWT(token);
		ctx.state.session = payload;
	} catch {
		ctx.response.status = 401;
		ctx.response.body = { error: "Invalid token" };
		return;
	}

	await next();
};

export default auth;
