// controllers/board-live.ts
import { Router, Context, ServerSentEvent, RouterContext } from "https://deno.land/x/oak@v12.6.1/mod.ts";

const boardClients = new Map<string, Set<ReturnType<Context["sendEvents"]>>>();
export const sseRouter = new Router();

// Client subscribes to a board
sseRouter.get("/:boardId", (ctx: RouterContext<"/:boardId">) => {
    const boardId = ctx.params.boardId;
    if (!boardId) return ctx.throw(400, "Board ID missing");

    // Set SSE headers explicitly
    //ctx.response.headers.set("Content-Type", "text/event-stream");
    //ctx.response.headers.set("Cache-Control", "no-cache");
    //ctx.response.headers.set("Connection", "keep-alive");

    if (!boardClients.has(boardId)) boardClients.set(boardId, new Set());
    const target = ctx.sendEvents();
    const clients = boardClients.get(boardId)!;
    clients.add(target);

    console.log(`Client connected to board ${boardId}. Total: ${clients.size}`);

    target.addEventListener("close", () => {
        clients.delete(target);
        console.log(`Client disconnected from board ${boardId}. Total: ${clients.size}`);
    });
});

export function broadcastBoardUpdate(boardId: string, payload: any) {
    const clients = boardClients.get(boardId);
    if (!clients) return;

    const data = JSON.stringify(payload);
    console.log("Broadcasting SSE payload:", data);

    for (const client of clients) {
        client.dispatchMessage(`event: update\ndata: ${data}\n\n`);
    }
}


export default sseRouter;
