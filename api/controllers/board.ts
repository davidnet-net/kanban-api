import { Context } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { getDBClient } from "../lib/db.ts";
import { verifyJWT } from "../lib/jwt.ts";

// Helper functie om JS Date naar ICS datum formaat te zetten (YYYYMMDD)
const formatICSDate = (date: Date): string => {
    return date.toISOString().split('T')[0].replace(/-/g, '');
};

// Helper om datum met 1 dag te verhogen (nodig voor ICS exclusive end date)
const addDay = (date: Date): Date => {
    const result = new Date(date);
    result.setDate(result.getDate() + 1);
    return result;
};

export const get_board_ics = async (ctx: Context) => {
    // 1. Haal parameters op (werkt met router path: /board/ics/:id/:token)
    // @ts-ignore: params exists on context when using router
    const boardId = Number(ctx.params.id); 
    // @ts-ignore
    const token = ctx.params.token;

    if (isNaN(boardId) || !token) {
        return ctx.throw(400, "Invalid request parameters");
    }

    const client = await getDBClient();
    if (!client) return ctx.throw(500, "DB error");

    // 2. Valideer Bord & Token (Geen Auth Header nodig, token is de sleutel)
    const boardResult = await client.query(
        "SELECT name, calendar_ics_token FROM boards WHERE id = ?", 
        [boardId]
    );
    const board = boardResult[0];

    if (!board) {
        return ctx.throw(404, "Board not found");
    }

    // Veiligheidscheck: Token moet matchen
    if (board.calendar_ics_token !== token) {
        return ctx.throw(401, "Invalid calendar token");
    }

    // 3. Haal Cards op (Cards -> Lists -> Board)
    // We pakken alleen kaarten die niet gearchiveerd zijn EN minstens één datum hebben
    const cards = await client.query(`
        SELECT c.id, c.name, c.description, c.start_date, c.due_date 
        FROM cards c
        JOIN lists l ON c.list_id = l.id
        WHERE l.board_id = ? 
        AND c.is_archived = FALSE
        AND (c.start_date IS NOT NULL OR c.due_date IS NOT NULL)
    `, [boardId]);

    // 4. Bouw de ICS String
    let icsContent = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "kanban.davidnet.net:-//Davidnet//KanbanCalendar//EN",
        `X-WR-CALNAME:${board.name}`,
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH"
    ];

    for (const card of cards) {
        const now = formatICSDate(new Date()) + "T120000Z"; // Timestamp voor DTSTAMP
        
        let dtStart: string;
        let dtEnd: string;

        // Datum Logica
        if (card.start_date && card.due_date) {
            // Van X tot Y
            dtStart = formatICSDate(card.start_date);
            // End date is exclusief in ICS, dus we tellen er 1 dag bij op
            dtEnd = formatICSDate(addDay(card.due_date));
        } else if (card.start_date) {
            // Alleen startdatum -> Hele dag event op startdatum
            dtStart = formatICSDate(card.start_date);
            dtEnd = formatICSDate(addDay(card.start_date));
        } else {
            // Alleen due date -> Hele dag event op due date
            dtStart = formatICSDate(card.due_date);
            dtEnd = formatICSDate(addDay(card.due_date));
        }

        // Description opschonen (newlines vervangen door \n voor ICS)
        const description = card.description 
            ? card.description.replace(/\n/g, "\\n").replace(/,/g, "\\,") 
            : "";
        
        const summary = card.name.replace(/,/g, "\\,");

        icsContent.push(
            "BEGIN:VEVENT",
            `UID:card-${card.id}@kanban.davidnet.net`,
            `DTSTAMP:${now}`,
            `DTSTART;VALUE=DATE:${dtStart}`,
            `DTEND;VALUE=DATE:${dtEnd}`,
            `SUMMARY:${summary}`,
            `DESCRIPTION:${description}`,
            "END:VEVENT"
        );
    }

    icsContent.push("END:VCALENDAR");

    // 5. Stuur response
    ctx.response.status = 200;
    // Belangrijk: Juiste header zodat agenda apps (Google Calendar, Outlook) het snappen
    ctx.response.headers.set("Content-Type", "text/calendar; charset=utf-8");
    ctx.response.headers.set("Content-Disposition", `attachment; filename="${board.name}.ics"`);
    ctx.response.body = icsContent.join("\r\n");
};

export const get_board = async (ctx: Context) => {
    const body = await ctx.request.body({ type: "json" }).value;
    const id = Number(body.id);
    if (isNaN(id) || id <= 0) return ctx.throw(400, "Invalid board id");

    const client = await getDBClient();
    if (!client) return ctx.throw(500, "DB error");

    const result = await client.query("SELECT * FROM boards WHERE id = ?", [id]);
    const board = result[0];
    if (!board) {
        ctx.response.status = 404;
        ctx.response.body = { error: "Board not found" }
        return;
    }

    console.log("Public: " + board.is_public);
    let payload;
    try {
        const authHeader = ctx.request.headers.get("authorization");
        console.log(authHeader);
        if (!authHeader?.startsWith("Bearer ")) return ctx.throw(401, "Unauthorized");

        payload = await verifyJWT(authHeader.slice(7));
    } catch {
        if (board.is_public) {
            ctx.response.body = board;
            return;
        } else {
            return ctx.throw(401, "Invalid token");
        }
    }

    try {
        await client.execute(
            "INSERT INTO recent_boards (user_id, board_id) VALUES (?, ?)",
            [payload.userId, id]
        );
        ctx.response.status = 201;
    } catch (err) {
        console.error(err);
        ctx.throw(500, "Failed to create recent");
    }

    if (board.is_public) {
        ctx.response.body = board;
        return;
    }

    const userId = payload.userId;
    if (board.owner === userId) {
        ctx.response.body = board;
        return;
    }

    const membership = await client.query(
        "SELECT * FROM board_members WHERE board_id = ? AND user_id = ?",
        [id, userId]
    );

    if (membership.length === 0) {
        ctx.response.status = 403;
        ctx.response.body = { error: "Not board member" }
        return;
    }
    ctx.response.body = board;
};

export const set_board_background = async (ctx: Context) => {
    const body = await ctx.request.body({ type: "json" }).value;
    const boardId = Number(body.board_id);
    const backgroundUrl = body.background_url?.trim();

    if (isNaN(boardId) || boardId <= 0) {
        return ctx.throw(400, "Invalid board id");
    }

    if (!backgroundUrl) {
        return ctx.throw(400, "Background URL is required");
    }

    const userId = ctx.state.session.userId;
    const client = await getDBClient();
    if (!client) return ctx.throw(500, "DB error");

    // Get board and verify ownership
    const boardResult = await client.query("SELECT owner FROM boards WHERE id = ?", [boardId]);
    const board = boardResult[0];
    if (!board) return ctx.throw(404, "Board not found");

    if (board.owner !== userId) {
        return ctx.throw(403, "Only the owner can change the background");
    }

    try {
        await client.execute(
            "UPDATE boards SET background_url = ? WHERE id = ?",
            [backgroundUrl, boardId]
        );

        ctx.response.status = 200;
        ctx.response.body = { ok: true, board_id: boardId, background_url: backgroundUrl };
    } catch (err) {
        console.error(err);
        ctx.throw(500, "Failed to update board background");
    }
};

export const am_i_member = async (ctx: Context) => {
    const body = await ctx.request.body({ type: "json" }).value;
    const id = Number(body.id);
    if (isNaN(id) || id <= 0) return ctx.throw(400, "Invalid board id");

    const authHeader = ctx.request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) return ctx.throw(401, "Unauthorized");

    let payload;
    try {
        payload = await verifyJWT(authHeader.slice(7));
    } catch {
        return ctx.throw(401, "Invalid token");
    }

    const userId = payload.userId;
    const client = await getDBClient();
    if (!client) return ctx.throw(500, "DB error");

    const boardResult = await client.query("SELECT owner FROM boards WHERE id = ?", [id]);
    const board = boardResult[0];
    if (!board) return ctx.throw(404, "Board not found");

    if (board.owner === userId) {
        ctx.response.body = { result: true };
        return;
    }

    const membershipResult = await client.query(
        "SELECT id FROM board_members WHERE board_id = ? AND user_id = ?",
        [id, userId]
    );

    ctx.response.body = { result: membershipResult.length > 0 };
};

export const get_board_ics_entries = async (ctx: Context) => {
    // 1. Parse Parameters
    // @ts-ignore: params exists on context when using router
    const boardId = Number(ctx.params.id);
    
    if (isNaN(boardId) || boardId <= 0) {
        return ctx.throw(400, "Invalid board id");
    }

    // Since 'auth' middleware is used, we expect session data
    // @ts-ignore
    const userId = ctx.state.session?.userId;
    if (!userId) {
        return ctx.throw(401, "Unauthorized");
    }

    const client = await getDBClient();
    if (!client) return ctx.throw(500, "DB error");

    // 2. Authorization Check (Owner or Member)
    // First, get the board owner to check ownership
    const boardResult = await client.query(
        "SELECT owner FROM boards WHERE id = ?", 
        [boardId]
    );
    const board = boardResult[0];

    if (!board) {
        return ctx.throw(404, "Board not found");
    }

    let isAuthorized = false;

    // A: Is the user the Owner?
    if (board.owner === userId) {
        isAuthorized = true;
    } else {
        // B: Is the user a Member?
        const memberResult = await client.query(
            "SELECT 1 FROM board_members WHERE board_id = ? AND user_id = ?",
            [boardId, userId]
        );
        if (memberResult.length > 0) {
            isAuthorized = true;
        }
    }

    if (!isAuthorized) {
        return ctx.throw(403, "You are not a member of this board");
    }

    // 3. Fetch ICS Entries
    try {
        const entries = await client.query(
            "SELECT * FROM calendar_ics WHERE board_id = ?",
            [boardId]
        );

        ctx.response.status = 200;
        ctx.response.body = entries;
    } catch (err) {
        console.error("Error fetching calendar entries:", err);
        ctx.throw(500, "Failed to retrieve calendar entries");
    }
};

export const create_board = async (ctx: Context) => {
    const body = await ctx.request.body({ type: "json" }).value;
    const name = body.name?.trim();
    const isPublic = Boolean(body.is_public);
    const backgroundUrl = body.background_url?.trim();

    if (!name || !backgroundUrl) return ctx.throw(400, "Name and background URL required");

    const userId = ctx.state.session.userId;
    const client = await getDBClient();
    if (!client) return ctx.throw(500, "DB error");

    try {
        const result = await client.execute(
            "INSERT INTO boards (name, owner, is_public, background_url, calendar_ics_token) VALUES (?, ?, ?, ?, ?)",
            [name, userId, isPublic ? 1 : 0, backgroundUrl, crypto.randomUUID()]
        );

        const newBoardId = result.lastInsertId;
        await client.execute(
            "INSERT INTO board_members (user_id, board_id, role) VALUES (?, ?, 'owner')",
            [userId, newBoardId]
        );

        ctx.response.status = 201;
        ctx.response.body = {
            id: newBoardId,
            name,
            owner: userId,
            is_public: isPublic,
            background_url: backgroundUrl
        };
    } catch (err) {
        console.error(err);
        ctx.throw(500, "Failed to create board");
    }
};

export const get_lists = async (ctx: Context) => {
    const body = await ctx.request.body({ type: "json" }).value;
    const boardId = Number(body.board_id);
    if (isNaN(boardId) || boardId <= 0) return ctx.throw(400, "Invalid board id");

    const client = await getDBClient();
    if (!client) return ctx.throw(500, "DB error");

    const boardResult = await client.query("SELECT * FROM boards WHERE id = ?", [boardId]);
    const board = boardResult[0];
    if (!board) return ctx.throw(404, "Board not found");

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
        if (board.owner !== userId) {
            const membership = await client.query(
                "SELECT id FROM board_members WHERE board_id = ? AND user_id = ?",
                [boardId, userId]
            );
            if (membership.length === 0) return ctx.throw(403, "Forbidden");
        }
    }

    const lists = await client.query("SELECT * FROM lists WHERE board_id = ? ORDER BY position ASC", [boardId]);
    ctx.response.body = lists;
};

export const favorite_board = async (ctx: Context) => {
    const body = await ctx.request.body({ type: "json" }).value;
    const board_id = Number(body.board_id);

    if (isNaN(board_id) || board_id <= 0) return ctx.throw(400, "Invalid list id");

    const client = await getDBClient();
    if (!client) return ctx.throw(500, "DB error");

    // Check list exists
    const boards = await client.query("SELECT id FROM boards WHERE id = ?", [board_id]);
    const board = boards[0];
    if (!board) return ctx.throw(404, "Board not found");

    try {
        const result = await client.query(
            "SELECT 1 FROM favorite_boards WHERE user_id = ? AND board_id = ? LIMIT 1",
            [ctx.state.session.userId, board_id]
        );

        if (result.length > 1) {
            ctx.response.status = 400;
            ctx.response.body = { error: "Already favorited" }
            return;
        }

        await client.execute(
            "INSERT INTO favorite_boards (user_id, board_id) VALUES (?, ?)",
            [ctx.state.session.userId, board_id]
        );
        ctx.response.status = 201;
        ctx.response.body = { ok: true }
    } catch (err) {
        console.error(err);
        ctx.throw(500, "Failed to create favorite");
    }
};


export const unfavorite_board = async (ctx: Context) => {
    const body = await ctx.request.body({ type: "json" }).value;
    const board_id = Number(body.board_id);

    if (isNaN(board_id) || board_id <= 0) return ctx.throw(400, "Invalid board id");

    const client = await getDBClient();
    if (!client) return ctx.throw(500, "DB error");

    // Check if board exists
    const boards = await client.query("SELECT id FROM boards WHERE id = ?", [board_id]);
    const board = boards[0];
    if (!board) return ctx.throw(404, "Board not found");

    try {
        await client.execute(
            "DELETE FROM favorite_boards WHERE user_id = ? AND board_id = ?",
            [ctx.state.session.userId, board_id]
        );


        ctx.response.status = 200;
        ctx.response.body = { ok: true }
    } catch (err) {
        console.error(err);
        ctx.throw(500, "Failed to remove favorite");
    }
};


export const is_favorited = async (ctx: Context) => {
    const body = await ctx.request.body({ type: "json" }).value;
    const board_id = Number(body.board_id);

    if (isNaN(board_id) || board_id <= 0) return ctx.throw(400, "Invalid board id");

    const client = await getDBClient();
    if (!client) return ctx.throw(500, "DB error");

    try {
        const result = await client.query(
            "SELECT 1 FROM favorite_boards WHERE user_id = ? AND board_id = ? LIMIT 1",
            [ctx.state.session.userId, board_id]
        );

        ctx.response.status = 200;
        ctx.response.body = { favorited: result.length > 0 };
    } catch (err) {
        console.error(err);
        ctx.throw(500, "Failed to check favorite");
    }
};

export const delete_board = async (ctx: Context) => {
    const body = await ctx.request.body({ type: "json" }).value;
    const boardId = Number(body.board_id);

    if (isNaN(boardId) || boardId <= 0) return ctx.throw(400, "Invalid board id");

    const client = await getDBClient();
    if (!client) return ctx.throw(500, "DB error");

    // Get board and verify ownership
    const boardResult = await client.query("SELECT owner FROM boards WHERE id = ?", [boardId]);
    const board = boardResult[0];
    if (!board) return ctx.throw(404, "Board not found");

    const userId = ctx.state.session.userId;
    if (board.owner !== userId) return ctx.throw(403, "Only the owner can delete this board");

    try {
        await client.execute("DELETE FROM boards WHERE id = ?", [boardId]);

        ctx.response.status = 200;
        ctx.response.body = { ok: true, message: "Board deleted successfully" };
    } catch (err) {
        console.error(err);
        ctx.throw(500, "Failed to delete board");
    }
};

export const edit_board = async (ctx: Context) => {
    const body = await ctx.request.body({ type: "json" }).value;
    const boardId = Number(body.board_id);
    const name = body.name?.trim();
    const isPublic = Boolean(body.is_public);

    if (isNaN(boardId) || boardId <= 0) return ctx.throw(400, "Invalid board id");
    if (!name || name.length > 20 || /[^a-zA-Z0-9 ]/.test(name)) {
        return ctx.throw(400, "Invalid board name");
    }

    const client = await getDBClient();
    if (!client) return ctx.throw(500, "DB error");

    // Get board and verify ownership
    const boardResult = await client.query("SELECT owner FROM boards WHERE id = ?", [boardId]);
    const board = boardResult[0];
    if (!board) return ctx.throw(404, "Board not found");

    const userId = ctx.state.session.userId;
    if (board.owner !== userId) return ctx.throw(403, "Only the owner can edit this board");

    try {
        await client.execute(
            "UPDATE boards SET name = ?, is_public = ? WHERE id = ?",
            [name, isPublic ? 1 : 0, boardId]
        );

        ctx.response.status = 200;
        ctx.response.body = { ok: true, id: boardId, name, is_public: isPublic };
    } catch (err) {
        console.error(err);
        ctx.throw(500, "Failed to update board");
    }
};

export const get_board_members = async (ctx: Context) => {
    const body = await ctx.request.body({ type: "json" }).value;
    const boardId = Number(body.board_id);

    if (isNaN(boardId) || boardId <= 0) return ctx.throw(400, "Invalid board id");

    const userId = ctx.state.session.userId;
    const client = await getDBClient();
    if (!client) return ctx.throw(500, "DB error");

    // Get board info
    const boardResult = await client.query("SELECT owner FROM boards WHERE id = ?", [boardId]);
    const board = boardResult[0];
    if (!board) return ctx.throw(404, "Board not found");

    // Check if requester is owner or member
    if (board.owner !== userId) {
        const membership = await client.query(
            "SELECT id FROM board_members WHERE board_id = ? AND user_id = ?",
            [boardId, userId]
        );
        if (membership.length === 0) return ctx.throw(403, "Forbidden");
    }

    // Get all members except the owner
    const members = await client.query(
        "SELECT user_id FROM board_members WHERE board_id = ? AND user_id != ?",
        [boardId, board.owner]
    );

    ctx.response.status = 200;
    ctx.response.body = members.map((m: { user_id: number }) => m.user_id);
};

export const remove_board_member = async (ctx: Context) => {
    const body = await ctx.request.body({ type: "json" }).value;
    const boardId = Number(body.board_id);
    const memberId = Number(body.member_id);

    if (isNaN(boardId) || boardId <= 0) return ctx.throw(400, "Invalid board id");
    if (isNaN(memberId) || memberId <= 0) return ctx.throw(400, "Invalid member id");

    const userId = ctx.state.session.userId;
    const client = await getDBClient();
    if (!client) return ctx.throw(500, "DB error");

    // Get board info
    const boardResult = await client.query("SELECT owner FROM boards WHERE id = ?", [boardId]);
    const board = boardResult[0];
    if (!board) return ctx.throw(404, "Board not found");

    // Only the owner can remove members
    if (board.owner !== userId) return ctx.throw(403, "Only the owner can remove members");

    // Owner cannot remove themselves
    if (memberId === board.owner) return ctx.throw(400, "Owner cannot be removed");

    try {
        const _result = await client.execute(
            "DELETE FROM board_members WHERE board_id = ? AND user_id = ?",
            [boardId, memberId]
        );

        ctx.response.status = 200;
        ctx.response.body = { ok: true, message: "Member removed successfully" };
    } catch (err) {
        console.error(err);
        ctx.throw(500, "Failed to remove member");
    }
};

// POST /board/leave
export const leave_board = async (ctx: Context) => {
    const body = await ctx.request.body({ type: "json" }).value;
    const boardId = Number(body.board_id);
    const userId = ctx.state.session.userId;

    if (isNaN(boardId) || boardId <= 0) {
        return ctx.throw(400, "Invalid board id");
    }

    const client = await getDBClient();
    if (!client) return ctx.throw(500, "DB error");

    // Get board info
    const boardResult = await client.query(
        "SELECT owner FROM boards WHERE id = ?",
        [boardId]
    );
    const board = boardResult[0];
    if (!board) return ctx.throw(404, "Board not found");

    // Owner cannot leave their own board
    if (board.owner === userId) {
        return ctx.throw(400, "Owner cannot leave their own board");
    }

    try {
        // Remove user from board_members
        const result = await client.execute(
            "DELETE FROM board_members WHERE board_id = ? AND user_id = ?",
            [boardId, userId]
        );

        if (result.affectedRows === 0) {
            return ctx.throw(404, "You are not a member of this board");
        }

        ctx.response.status = 200;
        ctx.response.body = { ok: true, message: "Successfully left the board" };
    } catch (err) {
        console.error(err);
        ctx.throw(500, "Failed to leave board");
    }
};
