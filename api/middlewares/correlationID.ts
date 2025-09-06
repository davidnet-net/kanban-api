import { Middleware } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { v4 as uuid } from "https://deno.land/std@0.224.0/uuid/mod.ts";

export const correlationID: Middleware = async (ctx, next) => {
	const correlationID = ctx.request.headers.get("x-correlation-id") ??
		crypto.randomUUID();

	// Check if UUID is an UUID.
	if (!uuid.validate(correlationID)) {
		ctx.response.status = 400;
		ctx.response.body = { error: "Invalid Correlation ID" };
		return;
	}

	// Attach it to state so can be accessed inside the api.
	ctx.state.correlationID = correlationID;

	// Add it to the response as an header.
	ctx.response.headers.set("x-correlation-id", correlationID);

	await next();
};

export default correlationID;
