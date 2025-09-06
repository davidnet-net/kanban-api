import { Middleware } from "https://deno.land/x/oak@v12.6.1/mod.ts";

export const auth: Middleware = async (ctx, next) => {
	const _authHeader = ctx.request.headers.get("Authorization");
	//if (!authHeader || authHeader !== "Bearer mysecrettoken") {
	//  ctx.response.status = 401;
	//  ctx.response.body = { error: "Unauthorized" };
	//  return;
	//}
	await next();
};

export default auth;
