import { Context, Middleware } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { log_error } from "../lib/logger.ts";

export const errorHandler: Middleware = async (ctx: Context, next) => {
	try {
		await next();
	} catch (error) {
		log_error({
			"correlationID": ctx.state.correlationID.toString(),
			"error": error,
			"context": "Catched in middleware.",
		});

		ctx.response.status = 500;
		ctx.response.body = { error: "Unknown unhandled error." };
	}
};

export default errorHandler;
