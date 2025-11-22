import { Context } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import uptime from "../lib/uptime.ts";
import { getDBClient } from "../lib/db.ts";
import { getIsRabbitMQConnectionHealthy } from "../lib/amqp.ts";

// Check database availability
async function isDBHealthy() {
	try {
		const client = await getDBClient();
		if (!client) throw new Error("No DB client available");
		await client.execute("SELECT 1");
		return true;
	} catch (_) {
		return false;
	}
}

export const health = async (ctx: Context) => {
	const DatabaseHealthy = await isDBHealthy();
	const RabbitMQHealthy = await getIsRabbitMQConnectionHealthy();

	// Overall status
	const allHealthy = DatabaseHealthy && RabbitMQHealthy;
	const status = allHealthy ? "healthy" : "degraded";

	ctx.response.status = 200;
	ctx.response.body = {
		status,
		uptimeMS: uptime(),
		timestamp: new Date().toISOString(),
		DatabaseHealthy,
		RabbitMQHealthy,
	};
};

export const dockerhealth = async (ctx: Context) => {
	const DatabaseHealthy = await isDBHealthy();
	const RabbitMQHealthy = getIsRabbitMQConnectionHealthy();

	const allHealthy = DatabaseHealthy && RabbitMQHealthy;

	ctx.response.status = allHealthy ? 200 : 503;
	ctx.response.body = { DatabaseHealthy, RabbitMQHealthy };
};
