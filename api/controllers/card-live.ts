import { Router, RouterContext } from "https://deno.land/x/oak@v12.6.1/mod.ts";

const cardClients = new Map<string, Set<WebSocket>>();
export const wsRouter = new Router();

// Client subscribes to a card
wsRouter.get("/:cardId", async (ctx: RouterContext<"/:cardId">) => {
  const cardId = ctx.params.cardId;
  if (!cardId) return ctx.throw(400, "Card ID missing");

  if (!ctx.isUpgradable) return ctx.throw(400, "WebSocket not supported");
  const ws = await ctx.upgrade();

  if (!cardClients.has(cardId)) cardClients.set(cardId, new Set());
  const clients = cardClients.get(cardId)!;
  clients.add(ws);

  console.log(`Client connected to card ${cardId}. Total: ${clients.size}`);

  ws.onclose = () => {
    clients.delete(ws);
    console.log(`Client disconnected from card ${cardId}. Total: ${clients.size}`);
  };

  // deno-lint-ignore no-explicit-any
  ws.onerror = (err: any) => {
    console.error("WebSocket error:", err);
    clients.delete(ws);
  };
});

// deno-lint-ignore no-explicit-any
export function broadcastCardUpdate(cardId: string, payload: any) {
  const clients = cardClients.get(cardId);
  if (!clients) return;
  const message = JSON.stringify(payload);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  }
}

export default wsRouter;
