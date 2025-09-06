import { Context } from "https://deno.land/x/oak@v12.6.1/mod.ts";

export function getForwardedIP(ctx: Context) {
    // Oak’s headers API
    const forwarded = ctx.request.headers.get("forwarded");
    if (forwarded) {
        const match = forwarded.match(/for="?([^;"]+)"?/i);
        if (match) return match[1];
    }

    const xff = ctx.request.headers.get("x-forwarded-for");
    if (xff) {
        return xff.split(",")[0].trim();
    }

    // Oak provides ctx.request.ip directly (remoteAddr)
    return ctx.request.ip;
}