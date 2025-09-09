import { Middleware } from "https://deno.land/x/oak@v12.6.1/mod.ts";

const DA_ISPROD = Deno.env.get("DA_ISPROD") === "true";
const allowedHostRegex = /^([a-z0-9-]+\.)*davidnet\.net$/i;

// Fetch your server's external IP once at startup
export const serverExternalIP = await (async () => {
  try {
    const res = await fetch("https://api.ipify.org?format=text");
    return res.text();
  } catch {
    return null;
  }
})();

export const cors: Middleware = async (ctx, next) => {
  const origin = ctx.request.headers.get("origin")?.trim();

  if (!origin) {
    ctx.response.status = 403;
    ctx.response.headers.set("Access-Control-Allow-Origin", "*");
    ctx.response.body = "CORS origin header is required!";
    return;
  }

  let allow = false;

  try {
    const url = new URL(origin);
    const host = url.hostname;

    // Check domain match
    if (!DA_ISPROD || allowedHostRegex.test(host)) {
      allow = true;
    } else if (serverExternalIP) {
      // Resolve host to IP and check if it matches server's external IP
      const ips = await Deno.resolveDns(host, "A"); // IPv4 only
      if (ips.includes(serverExternalIP)) allow = true;
    }
  } catch {
    ctx.response.status = 400;
    ctx.response.headers.set("Access-Control-Allow-Origin", "*");
    ctx.response.body = "CORS origin header is invalid!";
    return;
  }

  if (!allow) {
    ctx.response.status = 403;
    ctx.response.headers.set("Access-Control-Allow-Origin", "*");
    ctx.response.body = "Not allowed!";
    return;
  }

  // Set CORS headers
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

  if (ctx.request.method === "OPTIONS") {
    ctx.response.status = 204;
    return;
  }

  await next();
};

export default cors;
