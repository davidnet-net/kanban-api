import { Context } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import getDBClient from "../lib/db.ts";
import { broadcastBoardUpdate } from "./board-live.ts";

export const add_card = async (ctx: Context) => {
    const body = await ctx.request.body({ type: "json" }).value;
    const listId = Number(body.list_id);
    const name = body.name?.trim();

    if (isNaN(listId) || listId <= 0) return ctx.throw(400, "Invalid list id");
    if (!name) return ctx.throw(400, "Card name is required");

    const client = await getDBClient();
    if (!client) return ctx.throw(500, "DB error");

    // Check list exists
    const listResult = await client.query("SELECT board_id FROM lists WHERE id = ?", [listId]);
    const list = listResult[0];
    if (!list) return ctx.throw(404, "List not found");

    // Check board exists
    const boardResult = await client.query("SELECT * FROM boards WHERE id = ?", [list.board_id]);
    const board = boardResult[0];
    if (!board) return ctx.throw(404, "Board not found");

    // Authorization: must be owner or board member
    const userId = ctx.state.session.userId;
    if (board.owner !== userId) {
        const membership = await client.query(
            "SELECT id FROM board_members WHERE board_id = ? AND user_id = ?",
            [board.id, userId]
        );
        if (membership.length === 0) return ctx.throw(403, "Forbidden");
    }

    // Determine the new card's position
    const posResult = await client.query("SELECT MAX(position) as maxPos FROM cards WHERE list_id = ?", [listId]);
    const maxPos = posResult[0]?.maxPos ?? 0;
    const newPosition = maxPos + 1;

    // Insert card with calculated position
    try {
        const result = await client.execute(
            "INSERT INTO cards (list_id, name, owner, position) VALUES (?, ?, ?, ?)",
            [listId, name, userId, newPosition]
        );
        const insertedId = result.lastInsertId;

        const newCard = await client.query("SELECT * FROM cards WHERE id = ?", [insertedId]);
        ctx.response.status = 201;
        ctx.response.body = newCard[0];

        broadcastBoardUpdate(String(list.board_id), {
            type: "card_update",
            listId,
            cards: await client.query("SELECT * FROM cards WHERE list_id = ? ORDER BY position ASC", [listId])
        });
    } catch (err) {
        console.error(err);
        ctx.throw(500, "Failed to create card");
    }
};

export const move_card = async (ctx: Context) => {
    const body = await ctx.request.body({ type: "json" }).value;
    const cardId = Number(body.card_id);
    const newListId = Number(body.list_id);
    const newPosition = Number(body.position);

    if (isNaN(cardId) || cardId <= 0) return ctx.throw(400, "Invalid card id");
    if (isNaN(newListId) || newListId <= 0) return ctx.throw(400, "Invalid list id");
    if (isNaN(newPosition) || newPosition < 0) return ctx.throw(400, "Invalid position");

    const client = await getDBClient();
    if (!client) return ctx.throw(500, "DB error");

    // Fetch the card
    const cardResult = await client.query("SELECT * FROM cards WHERE id = ?", [cardId]);
    const card = cardResult[0];
    if (!card) return ctx.throw(404, "Card not found");

    // Fetch the new list
    const listResult = await client.query("SELECT board_id FROM lists WHERE id = ?", [newListId]);
    const list = listResult[0];
    if (!list) return ctx.throw(404, "List not found");

    // Fetch the board
    const boardResult = await client.query("SELECT * FROM boards WHERE id = ?", [list.board_id]);
    const board = boardResult[0];
    if (!board) return ctx.throw(404, "Board not found");

    // Authorization: owner or member
    const userId = ctx.state.session.userId;
    if (board.owner !== userId) {
        const membership = await client.query(
            "SELECT id FROM board_members WHERE board_id = ? AND user_id = ?",
            [board.id, userId]
        );
        if (membership.length === 0) return ctx.throw(403, "Forbidden");
    }

    try {
        // Shift positions in target list to make room
        await client.execute(
            "UPDATE cards SET position = position + 1 WHERE list_id = ? AND position >= ?",
            [newListId, newPosition]
        );

        // Move the card
        await client.execute(
            "UPDATE cards SET list_id = ?, position = ? WHERE id = ?",
            [newListId, newPosition, cardId]
        );

        // Return updated card
        const updatedCardResult = await client.query("SELECT * FROM cards WHERE id = ?", [cardId]);
        ctx.response.body = updatedCardResult[0];

        broadcastBoardUpdate(String(list.board_id), {
            type: "card_update",
            newListId,
            cards: await client.query("SELECT * FROM cards WHERE list_id = ? ORDER BY position ASC", [newListId])
        });


    } catch (err) {
        console.error(err);
        ctx.throw(500, "Failed to move card");
    }
};