// controllers/board-live.ts
import { Router, Context, ServerSentEvent, RouterContext } from "https://deno.land/x/oak@v12.6.1/mod.ts";

const boardClients = new Map<string, Set<ReturnType<Context["sendEvents"]>>>();
export const sseRouter = new Router();

// Client subscribes to a board
sseRouter.get("/:boardId", (ctx: RouterContext<"/:boardId">) => {
  const boardId = ctx.params.boardId;
  if (!boardId) return ctx.throw(400, "Board ID missing");

  if (!boardClients.has(boardId)) boardClients.set(boardId, new Set());
  const target = ctx.sendEvents();
  const clients = boardClients.get(boardId)!;
  clients.add(target);

  console.log(`Client connected to board ${boardId}. Total: ${clients.size}`);

  target.addEventListener("close", () => {
    clients.delete(target);
    console.log(`Client disconnected from board ${boardId}. Total: ${clients.size}`);
  });

  target.dispatchMessage({ message: `Connected to board ${boardId}` });
});

export function broadcastBoardUpdate(boardId: string, payload: any) {
  const clients = boardClients.get(boardId);
  if (!clients) return;
  console.log("Broadcasting SSE payload:", payload);
  const event = new ServerSentEvent("update", payload);
  for (const client of clients) client.dispatchEvent(event);
}

export default sseRouter;
