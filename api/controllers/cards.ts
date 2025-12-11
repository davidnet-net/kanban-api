import { Context } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import getDBClient from "../lib/db.ts";
import { broadcastBoardUpdate } from "./board-live.ts";
import { verifyJWT } from "../lib/jwt.ts";
import { broadcastCardUpdate } from "./card-live.ts";

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
        broadcastCardUpdate(String(cardId), {
            type: "update_card"
        });

    } catch (err) {
        console.error(err);
        ctx.throw(500, "Failed to move card");
    }
};

/**
 * 1️⃣ Update card description
 */
export const update_card_description = async (ctx: Context) => {
    const body = await ctx.request.body({ type: "json" }).value;
    const cardId = Number(body.card_id);
    const description = body.description?.trim();

    if (isNaN(cardId) || cardId <= 0) return ctx.throw(400, "Invalid card id");

    const client = await getDBClient();
    if (!client) return ctx.throw(500, "DB error");

    const cardResult = await client.query("SELECT * FROM cards WHERE id = ?", [cardId]);
    const card = cardResult[0];
    if (!card) {
        ctx.response.status = 404;
        ctx.response.body = { error: "Card doesn't exist" }
    }

    // Authorization: owner or board member
    const boardResult = await client.query(
        "SELECT * FROM boards WHERE id = (SELECT board_id FROM lists WHERE id = ?)",
        [card.list_id]
    );
    const board = boardResult[0];
    const userId = ctx.state.session.userId;
    if (board.owner !== userId) {
        const membership = await client.query(
            "SELECT id FROM board_members WHERE board_id = ? AND user_id = ?",
            [board.id, userId]
        );
        if (membership.length === 0) return ctx.throw(403, "Forbidden");
    }

    await client.execute("UPDATE cards SET description = ? WHERE id = ?", [description, cardId]);
    const updatedCardResult = await client.query("SELECT * FROM cards WHERE id = ?", [cardId]);
    ctx.response.body = updatedCardResult[0];

    broadcastBoardUpdate(String(board.id), {
        type: "card_update",
        listId: card.list_id,
        cards: await client.query("SELECT * FROM cards WHERE list_id = ? ORDER BY position ASC", [card.list_id])
    });
    broadcastBoardUpdate(String(cardId), {
        type: "update_card"
    });
};

export const update_card_color = async (ctx: Context) => {
    const body = await ctx.request.body({ type: "json" }).value;
    const cardId = Number(body.card_id);
    const color = body.color?.trim();

    if (isNaN(cardId) || cardId <= 0) return ctx.throw(400, "Invalid card id");

    const client = await getDBClient();
    if (!client) return ctx.throw(500, "DB error");

    const cardResult = await client.query("SELECT * FROM cards WHERE id = ?", [cardId]);
    const card = cardResult[0];
    if (!card) {
        ctx.response.status = 404;
        ctx.response.body = { error: "Card doesn't exist" }
    }

    // Authorization: owner or board member
    const boardResult = await client.query(
        "SELECT * FROM boards WHERE id = (SELECT board_id FROM lists WHERE id = ?)",
        [card.list_id]
    );
    const board = boardResult[0];
    const userId = ctx.state.session.userId;
    if (board.owner !== userId) {
        const membership = await client.query(
            "SELECT id FROM board_members WHERE board_id = ? AND user_id = ?",
            [board.id, userId]
        );
        if (membership.length === 0) return ctx.throw(403, "Forbidden");
    }

    await client.execute("UPDATE cards SET color = ? WHERE id = ?", [color, cardId]);
    const updatedCardResult = await client.query("SELECT * FROM cards WHERE id = ?", [cardId]);
    ctx.response.body = updatedCardResult[0];

    broadcastBoardUpdate(String(board.id), {
        type: "card_update",
        listId: card.list_id,
        cards: await client.query("SELECT * FROM cards WHERE list_id = ? ORDER BY position ASC", [card.list_id])
    });
    broadcastBoardUpdate(String(cardId), {
        type: "update_card"
    });
};

export const create_checklist_item = async (ctx: Context) => {
    const body = await ctx.request.body({ type: "json" }).value;
    const cardId = Number(body.card_id);
    const name = body.name?.trim();

    if (isNaN(cardId) || cardId <= 0) return ctx.throw(400, "Invalid card id");
    if (!name) return ctx.throw(400, "Checklist item name is required");

    const client = await getDBClient();
    if (!client) return ctx.throw(500, "DB error");

    const cardResult = await client.query("SELECT * FROM cards WHERE id = ?", [cardId]);
    const card = cardResult[0];
    if (!card) return ctx.throw(404, "Card not found");

    await client.execute("INSERT INTO checklist_item (card_id, name) VALUES (?, ?)", [cardId, name]);
    const newItemResult = await client.query("SELECT * FROM checklist_item WHERE card_id = ? ORDER BY id DESC LIMIT 1", [cardId]);
    ctx.response.status = 201;
    ctx.response.body = newItemResult[0];

    broadcastBoardUpdate(String(card.list_id), {
        type: "checklist_update",
        cardId,
        items: await client.query("SELECT * FROM checklist_item WHERE card_id = ? ORDER BY id ASC", [cardId])
    });
    broadcastBoardUpdate(String(cardId), {
        type: "update_card"
    });
};

export const get_checklists = async (ctx: Context) => {
    const body = await ctx.request.body({ type: "json" }).value;
    const cardId = Number(body.card_id);

    if (isNaN(cardId) || cardId <= 0) return ctx.throw(400, "Invalid card id");

    const client = await getDBClient();
    if (!client) return ctx.throw(500, "DB error");

    // Fetch card
    const cardResult = await client.query("SELECT * FROM cards WHERE id = ?", [cardId]);
    const card = cardResult[0];
    if (!card) return ctx.throw(404, "Card not found");

    // Authorization: must be owner or board member
    const boardResult = await client.query(
        "SELECT * FROM boards WHERE id = (SELECT board_id FROM lists WHERE id = ?)",
        [card.list_id]
    );
    const board = boardResult[0];
    const userId = ctx.state.session.userId;

    if (board.owner !== userId) {
        const membership = await client.query(
            "SELECT id FROM board_members WHERE board_id = ? AND user_id = ?",
            [board.id, userId]
        );
        if (membership.length === 0) return ctx.throw(403, "Forbidden");
    }

    // Fetch checklist items
    const items = await client.query(
        "SELECT * FROM checklist_item WHERE card_id = ? ORDER BY id ASC",
        [cardId]
    );

    ctx.response.status = 200;
    ctx.response.body = {
        cardId,
        items
    };
};

/**
 * Toggle checklist item completed state
 */
export const toggle_checklist_item = async (ctx: Context) => {
    const body = await ctx.request.body({ type: "json" }).value;
    const itemId = Number(body.item_id);

    if (isNaN(itemId) || itemId <= 0) return ctx.throw(400, "Invalid checklist item id");

    const client = await getDBClient();
    if (!client) return ctx.throw(500, "DB error");

    // Fetch the checklist item
    const itemResult = await client.query("SELECT * FROM checklist_item WHERE id = ?", [itemId]);
    const item = itemResult[0];
    if (!item) return ctx.throw(404, "Checklist item not found");

    // Fetch the card for authorization
    const cardResult = await client.query("SELECT * FROM cards WHERE id = ?", [item.card_id]);
    const card = cardResult[0];
    if (!card) return ctx.throw(404, "Card not found");

    // Check board authorization
    const boardResult = await client.query(
        "SELECT * FROM boards WHERE id = (SELECT board_id FROM lists WHERE id = ?)",
        [card.list_id]
    );
    const board = boardResult[0];
    const userId = ctx.state.session.userId;

    if (board.owner !== userId) {
        const membership = await client.query(
            "SELECT id FROM board_members WHERE board_id = ? AND user_id = ?",
            [board.id, userId]
        );
        if (membership.length === 0) return ctx.throw(403, "Forbidden");
    }

    // Toggle is_checked
    const newChecked = !item.is_checked;
    await client.execute("UPDATE checklist_item SET is_checked = ? WHERE id = ?", [newChecked, itemId]);

    // Return updated item
    const updatedItemResult = await client.query("SELECT * FROM checklist_item WHERE id = ?", [itemId]);
    ctx.response.status = 200;
    ctx.response.body = updatedItemResult[0];

    // Broadcast update
    broadcastBoardUpdate(String(card.list_id), {
        type: "checklist_update",
        cardId: card.id,
        items: await client.query("SELECT * FROM checklist_item WHERE card_id = ? ORDER BY id ASC", [card.id])
    });
    broadcastCardUpdate(String(card.id), {
        type: "update_card"
    });
};


/**
 * 3️⃣ Change card title
 */
export const change_card_title = async (ctx: Context) => {
    const body = await ctx.request.body({ type: "json" }).value;
    const cardId = Number(body.card_id);
    const name = body.name?.trim();

    if (isNaN(cardId) || cardId <= 0) return ctx.throw(400, "Invalid card id");
    if (!name) return ctx.throw(400, "Card name is required");

    const client = await getDBClient();
    if (!client) return ctx.throw(500, "DB error");

    const cardResult = await client.query("SELECT * FROM cards WHERE id = ?", [cardId]);
    const card = cardResult[0];
    if (!card) return ctx.throw(404, "Card not found");

    // Authorization: owner or board member
    const boardResult = await client.query(
        "SELECT * FROM boards WHERE id = (SELECT board_id FROM lists WHERE id = ?)",
        [card.list_id]
    );
    const board = boardResult[0];
    const userId = ctx.state.session.userId;
    if (board.owner !== userId) {
        const membership = await client.query(
            "SELECT id FROM board_members WHERE board_id = ? AND user_id = ?",
            [board.id, userId]
        );
        if (membership.length === 0) return ctx.throw(403, "Forbidden");
    }

    await client.execute("UPDATE cards SET name = ? WHERE id = ?", [name, cardId]);
    const updatedCardResult = await client.query("SELECT * FROM cards WHERE id = ?", [cardId]);
    ctx.response.body = updatedCardResult[0];

    broadcastBoardUpdate(String(board.id), {
        type: "card_update",
        listId: card.list_id,
        cards: await client.query("SELECT * FROM cards WHERE list_id = ? ORDER BY position ASC", [card.list_id])
    });
    broadcastBoardUpdate(String(cardId), {
        type: "update_card"
    });
};

/**
 * Delete a checklist item
 */
export const delete_checklist_item = async (ctx: Context) => {
    const body = await ctx.request.body({ type: "json" }).value;
    const itemId = Number(body.item_id);

    if (isNaN(itemId) || itemId <= 0) return ctx.throw(400, "Invalid checklist item id");

    const client = await getDBClient();
    if (!client) return ctx.throw(500, "DB error");

    // Fetch the checklist item
    const itemResult = await client.query("SELECT * FROM checklist_item WHERE id = ?", [itemId]);
    const item = itemResult[0];
    if (!item) return ctx.throw(404, "Checklist item not found");

    // Fetch the card to check authorization
    const cardResult = await client.query("SELECT * FROM cards WHERE id = ?", [item.card_id]);
    const card = cardResult[0];
    if (!card) return ctx.throw(404, "Card not found");

    const boardResult = await client.query(
        "SELECT * FROM boards WHERE id = (SELECT board_id FROM lists WHERE id = ?)",
        [card.list_id]
    );
    const board = boardResult[0];
    const userId = ctx.state.session.userId;

    if (board.owner !== userId) {
        const membership = await client.query(
            "SELECT id FROM board_members WHERE board_id = ? AND user_id = ?",
            [board.id, userId]
        );
        if (membership.length === 0) return ctx.throw(403, "Forbidden");
    }

    // Delete the checklist item
    await client.execute("DELETE FROM checklist_item WHERE id = ?", [itemId]);
    ctx.response.status = 204; // No content

    broadcastBoardUpdate(String(card.list_id), {
        type: "checklist_update",
        cardId: card.id,
        items: await client.query("SELECT * FROM checklist_item WHERE card_id = ? ORDER BY id ASC", [card.id])
    });
};


export const delete_card = async (ctx: Context) => {
    const body = await ctx.request.body({ type: "json" }).value;
    const boardId = Number(body.board_id);
    const cardId = Number(body.card_id);

    if (isNaN(boardId) || boardId <= 0) return ctx.throw(400, "Invalid board id");
    if (isNaN(cardId) || cardId <= 0) return ctx.throw(400, "Invalid cardId");

    const client = await getDBClient();
    if (!client) return ctx.throw(500, "DB error");

    const boardResult = await client.query("SELECT * FROM boards WHERE id = ?", [boardId]);
    const board = boardResult[0];
    if (!board) return ctx.throw(404, "Board not found");

    const userId = ctx.state.session.userId;
    if (board.owner !== userId) {
        const membership = await client.query(
            "SELECT id FROM board_members WHERE board_id = ? AND user_id = ?",
            [board.id, userId]
        );
        if (membership.length === 0) return ctx.throw(403, "Forbidden");
    }

    const cardResult = await client.query("SELECT * FROM cards WHERE id = ?", [cardId]);
    const card = cardResult[0];
    if (!card) return ctx.throw(404, "Card not found in this board");

    try {
        await client.execute("DELETE FROM cards WHERE id = ?", [cardId]);
        ctx.response.status = 200;
        ctx.response.body = { message: "Card deleted successfully" };

        broadcastBoardUpdate(String(board.id), {
            type: "card_delete",
            card_id: cardId
        });
    } catch (err) {
        console.error(err);
        ctx.throw(500, "Failed to delete list");
    }
};

/**
 * Change card start and due dates
 */
export const change_card_dates = async (ctx: Context) => {
    const body = await ctx.request.body({ type: "json" }).value;
    const cardId = Number(body.card_id);

    // These can be a date string "YYYY-MM-DD" or null
    const startDate = body.start_date;
    const dueDate = body.due_date;

    if (isNaN(cardId) || cardId <= 0) return ctx.throw(400, "Invalid card id");

    const client = await getDBClient();
    if (!client) return ctx.throw(500, "DB error");

    // 1. Fetch the card to find the list and board
    const cardResult = await client.query("SELECT * FROM cards WHERE id = ?", [cardId]);
    const card = cardResult[0];
    if (!card) return ctx.throw(404, "Card not found");

    // 2. Fetch Board for Authorization
    const boardResult = await client.query(
        "SELECT * FROM boards WHERE id = (SELECT board_id FROM lists WHERE id = ?)",
        [card.list_id]
    );
    const board = boardResult[0];

    // 3. Authorization: Must be owner or board member
    const userId = ctx.state.session.userId;
    if (board.owner !== userId) {
        const membership = await client.query(
            "SELECT id FROM board_members WHERE board_id = ? AND user_id = ?",
            [board.id, userId]
        );
        if (membership.length === 0) return ctx.throw(403, "Forbidden");
    }

    try {
        // 4. Update the dates
        // passing `null` to the client.execute parameters will set the database column to NULL
        await client.execute(
            "UPDATE cards SET start_date = ?, due_date = ? WHERE id = ?",
            [startDate, dueDate, cardId]
        );

        // 5. Fetch updated card for response
        const updatedCardResult = await client.query("SELECT * FROM cards WHERE id = ?", [cardId]);
        ctx.response.body = updatedCardResult[0];

        // 6. Broadcast update to websocket clients
        broadcastBoardUpdate(String(board.id), {
            type: "card_update",
            listId: card.list_id,
            cards: await client.query("SELECT * FROM cards WHERE list_id = ? ORDER BY position ASC", [card.list_id])
        });

    } catch (err) {
        console.error(err);
        ctx.throw(500, "Failed to update dates");
    }
};

/**
 * Get all cards assigned to lists/boards the user has access to
 * that are due exactly today.
 */
export const get_cards_due_today = async (ctx: Context) => {
    // Assuming this is a GET request, so we rely on session, not body
    const userId = ctx.state.session.userId;

    if (!userId) return ctx.throw(401, "Unauthorized");

    const client = await getDBClient();
    if (!client) return ctx.throw(500, "DB error");

    try {
        // We join lists and boards to check permissions.
        // We select the card details, plus the board and list name for context in the UI.
        const cards = await client.query(`
            SELECT 
                c.*, 
                b.name as board_name, 
                b.id as board_id,
                l.name as list_name 
            FROM cards c
            INNER JOIN lists l ON c.list_id = l.id
            INNER JOIN boards b ON l.board_id = b.id
            LEFT JOIN board_members bm ON b.id = bm.board_id AND bm.user_id = ?
            WHERE 
                c.due_date = CURDATE() 
                AND c.is_archived = FALSE
                AND (b.owner = ? OR bm.user_id IS NOT NULL)
        `, [userId, userId]);

        ctx.response.status = 200;
        ctx.response.body = cards;

    } catch (err) {
        console.error(err);
        ctx.throw(500, "Failed to fetch due cards");
    }
};

/**
 * Get a single card by ID
 */
export const get_card = async (ctx: Context) => {
    const body = await ctx.request.body({ type: "json" }).value;
    const cardId = Number(body.card_id);

    if (isNaN(cardId) || cardId <= 0) return ctx.throw(400, "Invalid card id");

    const client = await getDBClient();
    if (!client) return ctx.throw(500, "DB error");

    // 1. Fetch the card
    const cardResult = await client.query("SELECT * FROM cards WHERE id = ?", [cardId]);
    const card = cardResult[0];
    if (!card) return ctx.throw(404, "Card not found");

    // 2. Fetch the list to find the board
    const listResult = await client.query("SELECT board_id FROM lists WHERE id = ?", [card.list_id]);
    const list = listResult[0];
    if (!list) return ctx.throw(404, "List not found for this card");

    // 3. Fetch the board to check permissions
    const boardResult = await client.query("SELECT * FROM boards WHERE id = ?", [list.board_id]);
    const board = boardResult[0];
    if (!board) return ctx.throw(404, "Board not found");

    // 4. Authorization
    if (!board.is_public) {
        const authHeader = ctx.request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) return ctx.throw(401, "Unauthorized");

        let payload;
        try {
            payload = await verifyJWT(authHeader.slice(7));
        } catch {
            return ctx.throw(401, "Invalid token");
        }

        const userId = payload.userId;

        // Check if owner or member
        if (board.owner !== userId) {
            const membership = await client.query(
                "SELECT id FROM board_members WHERE board_id = ? AND user_id = ?",
                [board.id, userId]
            );
            if (membership.length === 0) return ctx.throw(403, "Forbidden");
        }
    }

    // 5. Return the card
    ctx.response.status = 200;
    ctx.response.body = card;
};

export const create_comment = async (ctx: Context) => {
    const body = await ctx.request.body({ type: "json" }).value;
    const cardId = Number(body.card_id);
    const commentText = body.comment?.trim();

    if (isNaN(cardId) || cardId <= 0) return ctx.throw(400, "Invalid card id");
    if (!commentText) return ctx.throw(400, "Comment cannot be empty");

    const client = await getDBClient();
    if (!client) return ctx.throw(500, "DB error");

    // 1. Fetch the card to find the list
    const cardResult = await client.query("SELECT * FROM cards WHERE id = ?", [cardId]);
    const card = cardResult[0];
    if (!card) return ctx.throw(404, "Card not found");

    // 2. Fetch the list to find the board
    const listResult = await client.query("SELECT board_id FROM lists WHERE id = ?", [card.list_id]);
    const list = listResult[0];
    if (!list) return ctx.throw(404, "List not found");

    // 3. Fetch Board for Authorization
    const boardResult = await client.query("SELECT * FROM boards WHERE id = ?", [list.board_id]);
    const board = boardResult[0];
    if (!board) return ctx.throw(404, "Board not found");

    // 4. Authorization: Must be owner or board member
    const userId = ctx.state.session.userId;
    if (board.owner !== userId) {
        const membership = await client.query(
            "SELECT id FROM board_members WHERE board_id = ? AND user_id = ?",
            [board.id, userId]
        );
        if (membership.length === 0) return ctx.throw(403, "Forbidden");
    }

    try {
        // 5. Insert the comment
        const result = await client.execute(
            "INSERT INTO comments (card_id, user_id, comment) VALUES (?, ?, ?)",
            [cardId, userId, commentText]
        );
        const insertedId = result.lastInsertId;

        // 6. Fetch the newly created comment
        // Note: You might want to JOIN with the 'users' table here to get the username/avatar
        // e.g., SELECT c.*, u.username FROM comments c JOIN users u ON c.user_id = u.user_id ...
        const newCommentResult = await client.query(
            "SELECT * FROM comments WHERE id = ?",
            [insertedId]
        );
        const newComment = newCommentResult[0];

        ctx.response.status = 201;
        ctx.response.body = newComment;

        // 7. Broadcast update
        broadcastCardUpdate(String(cardId), {
            type: "update_card"
        });
    } catch (err) {
        console.error(err);
        ctx.throw(500, "Failed to create comment");
    }
};

export const get_comments = async (ctx: Context) => {
    // Assuming this is a POST to pass card_id in body, 
    // or you can change to ctx.request.url.searchParams for a GET request.
    const body = await ctx.request.body({ type: "json" }).value;
    const cardId = Number(body.card_id);

    if (isNaN(cardId) || cardId <= 0) return ctx.throw(400, "Invalid card id");

    const client = await getDBClient();
    if (!client) return ctx.throw(500, "DB error");

    // 1. Fetch card to find connection to board
    const cardResult = await client.query("SELECT list_id FROM cards WHERE id = ?", [cardId]);
    const card = cardResult[0];
    if (!card) return ctx.throw(404, "Card not found");

    // 2. Fetch list to find board
    const listResult = await client.query("SELECT board_id FROM lists WHERE id = ?", [card.list_id]);
    const list = listResult[0];
    if (!list) return ctx.throw(404, "List not found");

    // 3. Fetch board for Authorization
    const boardResult = await client.query("SELECT * FROM boards WHERE id = ?", [list.board_id]);
    const board = boardResult[0];
    if (!board) return ctx.throw(404, "Board not found");

    // 4. Authorization
    // If the board is public, we might skip the check, but assuming standard logic:
    const userId = ctx.state.session.userId;
    if (board.owner !== userId) {
        const membership = await client.query(
            "SELECT id FROM board_members WHERE board_id = ? AND user_id = ?",
            [board.id, userId]
        );
        if (membership.length === 0) return ctx.throw(403, "Forbidden");
    }

    try {
        // 5. Fetch comments
        // Optional: JOIN users ON comments.user_id = users.user_id to get author names
        const comments = await client.query(
            "SELECT * FROM comments WHERE card_id = ? ORDER BY created_at ASC",
            [cardId]
        );

        ctx.response.status = 200;
        ctx.response.body = {
            card_id: cardId,
            comments: comments
        };

    } catch (err) {
        console.error(err);
        ctx.throw(500, "Failed to fetch comments");
    }
};