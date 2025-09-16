import { Middleware } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { log } from "../lib/logger.ts";

const DA_ISPROD = Deno.env.get("DA_ISPROD") === "true";
const allowedHostRegex = /^([a-z0-9-]+\.)*davidnet\.net$/i;

// Fetch your server's external IP once at startup
export const serverExternalIP = await (async () => {
  try {
    const res = await fetch("https://api.ipify.org?format=text");
    return (await res.text()).trim();
  } catch {
    return null;
  }
})();

// Utility to check if an IP is internal
function isInternalIP(ip: string) {
  return (
    ip === "127.0.0.1" ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    (/^172\.(1[6-9]|2\d|3[0-1])\./).test(ip)
  );
}

export const cors: Middleware = async (ctx, next) => {
  const origin = ctx.request.headers.get("origin")?.trim() || "*";
  const clientIP = ctx.request.ip; // if behind a proxy, consider x-forwarded-for

  // Always set CORS headers first so OPTIONS preflight works
  ctx.response.headers.set("Access-Control-Allow-Origin", origin);
  ctx.response.headers.set(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,DELETE,OPTIONS"
  );
  ctx.response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-correlation-id"
  );
  ctx.response.headers.set("Access-Control-Allow-Credentials", "true");

  // Respond immediately for OPTIONS requests
  if (ctx.request.method === "OPTIONS") {
    ctx.response.status = 204;
    return;
  }

  // Allow internal IPs and server's external IP
  if ((serverExternalIP && clientIP === serverExternalIP) || isInternalIP(clientIP) || !DA_ISPROD) {
    await next();
    return;
  }

  if (!origin) {
    log("Denied: ", clientIP, " no cors origin.");
    ctx.response.status = 403;
    ctx.response.body = "CORS origin header is required!";
    return;
  }

  let allow = false;

  try {
    const url = new URL(origin);
    const host = url.hostname;

    if (!DA_ISPROD || allowedHostRegex.test(host)) {
      allow = true;
    } else if (serverExternalIP) {
      const ips = await Deno.resolveDns(host, "A");
      if (ips.includes(serverExternalIP)) allow = true;
    }
  } catch {
    ctx.response.status = 400;
    ctx.response.body = "CORS origin header is invalid!";
    return;
  }

  if (!allow) {
    log("Denied: ", clientIP, " not allowed.");
    ctx.response.status = 403;
    ctx.response.body = "Not allowed!";
    return;
  }

  await next();
};

export default cors;
