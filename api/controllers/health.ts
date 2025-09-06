import { Context } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import uptime from "../lib/uptime.ts";
import { getDBClient } from "../lib/db.ts";

async function isDBHealthy() {
	try {
		const client = await getDBClient();
		if (!client) throw "No DB client available";
		await client.execute("SELECT 1");
		return true;
	} catch (_) {
		return false;
	}
}

export const health = async (ctx: Context) => {
	const DatabaseHealthy: boolean = await isDBHealthy();

	const status = DatabaseHealthy ? "healthy" : "degraded";
	const uptimeMS = uptime();
	const timestamp = new Date().toISOString();

	ctx.response.body = { status, uptimeMS, timestamp, DatabaseHealthy };
};

export const dockerhealth = async (ctx: Context) => {
	const DatabaseHealthy: boolean = await isDBHealthy();

	ctx.response.status = DatabaseHealthy ? 204 : 503;
};
