import { Client } from "https://deno.land/x/mysql/mod.ts";
import { log_error } from "./logger.ts";

let dbClient: Client | null = null;
let initialConnectionSucceeded = false;

async function connectToDB(): Promise<Client | null> {
	try {
		const client = await new Client().connect({
			hostname: Deno.env.get("DA_DB_HOST"),
			username: Deno.env.get("DA_DB_USER"),
			password: Deno.env.get("DA_DB_PASS"),
			db: Deno.env.get("DA_DB_NAME"),
			port: 3306,
		});

		initialConnectionSucceeded = true;
		dbClient = client;
		return client;
	} catch (err) {
		log_error("FAILED TO CONNECT TO DB!");
		log_error(err); // Log error details
		return null;
	}
}

/**
 * Safely gets a healthy DB client.
 * If already connected, returns the existing one.
 * If not, attempts to reconnect.
 */
export async function getDBClient(): Promise<Client | null> {
	// If we already have a client, test it
	if (dbClient) {
		try {
			await dbClient.execute("SELECT 1");
			return dbClient;
		} catch (err) {
			log_error("DB client exists but failed SELECT 1 — reconnecting.");
			log_error(err);
			// Try to reconnect
			dbClient = null;
		}
	}

	// Attempt (re)connection
	if (!initialConnectionSucceeded || !dbClient) {
		console.log("Retrying inital connection");
		return await connectToDB();
	}

	return dbClient;
}

export default getDBClient;
