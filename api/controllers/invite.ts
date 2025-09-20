// invite.ts
import { Context } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { getDBClient } from "../lib/db.ts";

// POST /invite/send
export const send_invite = async (ctx: Context) => {
    const body = await ctx.request.body({ type: "json" }).value;
    const boardId = Number(body.board_id);
    const inviteeId = Number(body.user_id);
    const inviterId = ctx.state.session.userId;

    if (isNaN(boardId) || boardId <= 0 || isNaN(inviteeId) || inviteeId <= 0) {
        return ctx.throw(400, "Invalid board_id or user_id");
    }

    const client = await getDBClient();
    if (!client) return ctx.throw(500, "DB error");

    // Check if inviter is the board owner or admin
    const membership = await client.query(
        "SELECT role FROM board_members WHERE board_id = ? AND user_id = ?",
        [boardId, inviterId]
    );
    if (membership.length === 0 || !["owner", "admin"].includes(membership[0].role)) {
        return ctx.throw(403, "Not allowed to invite");
    }

    try {
        await client.execute(
            `INSERT INTO board_invites (board_id, inviter_id, invitee_id) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE status = 'pending'`,
            [boardId, inviterId, inviteeId]
        );

        ctx.response.status = 201;
        ctx.response.body = { ok: true };
    } catch (err) {
        console.error(err);
        ctx.throw(500, "Failed to send invite");
    }
};

// POST /invite/accept
export const accept_invite = async (ctx: Context) => {
    const body = await ctx.request.body({ type: "json" }).value;
    const inviteId = Number(body.invite_id);
    const userId = ctx.state.session.userId;

    if (isNaN(inviteId) || inviteId <= 0) return ctx.throw(400, "Invalid invite_id");

    const client = await getDBClient();
    if (!client) return ctx.throw(500, "DB error");

    const invite = (await client.query(
        "SELECT * FROM board_invites WHERE id = ? AND invitee_id = ? AND status = 'pending'",
        [inviteId, userId]
    ))[0];

    if (!invite) return ctx.throw(404, "Invite not found or already handled");

    try {
        await client.execute(
            "UPDATE board_invites SET status = 'accepted' WHERE id = ?",
            [inviteId]
        );

        // Add user as member
        await client.execute(
            "INSERT INTO board_members (user_id, board_id, role) VALUES (?, ?, 'member')",
            [userId, invite.board_id]
        );

        ctx.response.status = 200;
        ctx.response.body = { ok: true };
    } catch (err) {
        console.error(err);
        ctx.throw(500, "Failed to accept invite");
    }
};

// POST /invite/decline
export const decline_invite = async (ctx: Context) => {
    const body = await ctx.request.body({ type: "json" }).value;
    const inviteId = Number(body.invite_id);
    const userId = ctx.state.session.userId;

    if (isNaN(inviteId) || inviteId <= 0) return ctx.throw(400, "Invalid invite_id");

    const client = await getDBClient();
    if (!client) return ctx.throw(500, "DB error");

    try {
        const result = await client.execute(
            "UPDATE board_invites SET status = 'declined' WHERE id = ? AND invitee_id = ?",
            [inviteId, userId]
        );

        if (result.affectedRows === 0) return ctx.throw(404, "Invite not found");

        ctx.response.status = 200;
        ctx.response.body = { ok: true };
    } catch (err) {
        console.error(err);
        ctx.throw(500, "Failed to decline invite");
    }
};

// GET /invite/my
export const get_my_invites = async (ctx: Context) => {
    const userId = ctx.state.session.userId;

    const client = await getDBClient();
    if (!client) return ctx.throw(500, "DB error");

    try {
        const invites = await client.query(
            `SELECT i.id, i.board_id, i.inviter_id, i.status, b.name AS board_name
             FROM board_invites i
             JOIN boards b ON i.board_id = b.id
             WHERE i.invitee_id = ? AND i.status = 'pending'`,
            [userId]
        );

        ctx.response.status = 200;
        ctx.response.body = invites.map((i: any) => ({
            invite_id: i.id,
            board_id: i.board_id,
            board_name: i.board_name,
            inviter_id: i.inviter_id,
            status: i.status
        }));
    } catch (err) {
        console.error(err);
        ctx.throw(500, "Failed to get invites");
    }
};
