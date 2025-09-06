// lib/logger.ts
import { ensureDir, exists } from "https://deno.land/std@0.224.0/fs/mod.ts";
import { join } from "https://deno.land/std@0.224.0/path/mod.ts";

// Configuration
const rawLogDir = Deno.env.get("DA_LOG_DIR");
const DA_KEEP_LOG_DAYS = Number(Deno.env.get("DA_KEEP_LOG_DAYS"));
const DA_LOG_TO_TERMINAL = Deno.env.get("DA_LOG_TO_TERMINAL") === "true";

if (!rawLogDir) throw new Error("Missing env: DA_LOG_DIR");
if (isNaN(DA_KEEP_LOG_DAYS)) throw new Error("Invalid env: DA_KEEP_LOG_DAYS");
if (typeof DA_LOG_TO_TERMINAL !== "boolean") {
	throw new Error("Invalid env: DA_LOG_TO_TERMINAL");
}
const DA_LOG_DIR: string = rawLogDir;

const LATEST_LOG = join(DA_LOG_DIR, "latest.log");
const LOG_EXTENSION = ".log";
const DATE_FORMAT = new Intl.DateTimeFormat("nl-NL", {
	day: "2-digit",
	month: "2-digit",
	year: "numeric",
});

const logQueue: string[] = [];
let isWriting = false;

// Utility Functions
function formatDate(date: Date): string {
	return DATE_FORMAT.format(date).replace(/\//g, "-");
}

async function getNextAvailableLogPath(base: string): Promise<string> {
	let counter = 0;
	let filename = `${base}${LOG_EXTENSION}`;
	let filepath = join(DA_LOG_DIR, filename);

	while (await exists(filepath)) {
		filename = `${base}_${++counter}${LOG_EXTENSION}`;
		filepath = join(DA_LOG_DIR, filename);
	}

	return filepath;
}

async function rotateLogs() {
	if (!(await exists(LATEST_LOG))) return;

	const todayBase = formatDate(new Date());
	const newLogPath = await getNextAvailableLogPath(todayBase);
	await Deno.rename(LATEST_LOG, newLogPath);

	const now = Date.now();
	const maxAge = DA_KEEP_LOG_DAYS * 24 * 60 * 60 * 1000;

	for await (const entry of Deno.readDir(DA_LOG_DIR)) {
		if (
			entry.isFile &&
			entry.name.endsWith(LOG_EXTENSION) &&
			entry.name !== "latest.log"
		) {
			const filePath = join(DA_LOG_DIR, entry.name);
			const stat = await Deno.stat(filePath);
			if (stat.mtime && now - stat.mtime.getTime() > maxAge) {
				await Deno.remove(filePath);
			}
		}
	}
}

async function processLogQueue() {
	if (isWriting || logQueue.length === 0) return;

	isWriting = true;
	const toWrite = logQueue.join("");
	logQueue.length = 0;

	try {
		await Deno.writeTextFile(LATEST_LOG, toWrite, { append: true });
	} catch (err) {
		console.error("Logger error:", err);
	} finally {
		isWriting = false;
		processLogQueue(); // Check if more logs came in
	}
}

function enqueueLog(level: string, args: unknown[]) {
	if (DA_LOG_TO_TERMINAL) {
		const logFn = level === "log"
			? console.log
			: level === "warn"
			? console.warn
			: console.error;
		logFn(...args);
	}

	const entry = {
		level,
		timestamp: new Date().toISOString(),
		data: args.length === 1 ? args[0] : args,
	};

	logQueue.push(JSON.stringify(entry) + "\n");
	processLogQueue();
}

// Public API
export function log(...args: unknown[]) {
	enqueueLog("log", args);
}

export function warn(...args: unknown[]) {
	enqueueLog("warn", args);
}

export function log_error(...args: unknown[]) {
	enqueueLog("error", args);
}

// Initialization
await ensureDir(DA_LOG_DIR);
await rotateLogs();
