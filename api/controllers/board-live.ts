import { Router, RouterContext } from "https://deno.land/x/oak@v12.6.1/mod.ts";

const boardClients = new Map<string, Set<WebSocket>>();
export const wsRouter = new Router();

// Client subscribes to a board
wsRouter.get("/:boardId", async (ctx: RouterContext<"/:boardId">) => {
  const boardId = ctx.params.boardId;
  if (!boardId) return ctx.throw(400, "Board ID missing");

  if (!ctx.isUpgradable) return ctx.throw(400, "WebSocket not supported");
  const ws = await ctx.upgrade();

  if (!boardClients.has(boardId)) boardClients.set(boardId, new Set());
  const clients = boardClients.get(boardId)!;
  clients.add(ws);

  console.log(`Client connected to board ${boardId}. Total: ${clients.size}`);

  ws.onclose = () => {
    clients.delete(ws);
    console.log(`Client disconnected from board ${boardId}. Total: ${clients.size}`);
  };

  ws.onerror = (err) => {
    console.error("WebSocket error:", err);
    clients.delete(ws);
  };
});

export function broadcastBoardUpdate(boardId: string, payload: any) {
  const clients = boardClients.get(boardId);
  if (!clients) return;
  const message = JSON.stringify(payload);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  }
}

export default wsRouter;
