import { Application } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { log } from "./lib/logger.ts";
import router from "./routes/router.ts";
import correlationID from "./middlewares/correlationID.ts";
import errorHandler from "./middlewares/errorHandler.ts";
import requestLogger from "./middlewares/requestLogger.ts";
import envCheck from "./lib/envCheck.ts";

if (import.meta.main) {
	// Check if .env & config.ts are valid.
	const envCheckResult = envCheck();
	if (envCheckResult) {
		throw `Config [${envCheckResult}] is invalid.`;
	}

	const app = new Application();

	// Global middlewares
	app.use(correlationID);
	app.use(errorHandler);
	app.use(requestLogger);

	app.use(router.routes());
	app.use(router.allowedMethods());

	// Setup Abort Controller
	const controller = new AbortController();
	const { signal } = controller;

	const shutdown = (signalType: string) => {
		log(`Received ${signalType}. Shutting down gracefully...`);
		controller.abort();
	};

	// Listen for termination signals
	for (const sig of ["SIGINT", "SIGTERM"] as const) {
		Deno.addSignalListener(sig, () => shutdown(sig));
	}

	log("Server running on http://0.0.0.0:8000");

	// Start server
	try {
		await app.listen({ hostname: "0.0.0.0", port: 8000, signal });
	} catch (err) {
		if (err instanceof Error) {
			if (err.name === "AbortError") {
				log("Server stopped.");
			} else {
				log(`Server error: ${err.message}`);
			}
		} else {
			log(`Unknown error: ${err}`);
		}
	}
}
