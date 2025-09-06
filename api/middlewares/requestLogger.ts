import { Context, Middleware } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { log } from "../lib/logger.ts";

export const requestLogger: Middleware = async (ctx: Context, next) => {
	const start = Date.now();
	await next();
	const ms = Date.now() - start;
	log(
		`${ctx.request.method} - ${ctx.request.url} - ${ctx.state.correlationID} - ${ms}ms`,
	);
};

export default requestLogger;
