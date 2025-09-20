// routes/invite.ts
import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { 
    send_invite, 
    accept_invite, 
    decline_invite, 
    get_my_invites, 
	get_board_invites,
	cancel_invite
} from "../controllers/invite.ts";
import auth from "../middlewares/auth.ts";

const router = new Router();

router
    .post("/send", auth, send_invite)
    .post("/accept", auth, accept_invite)
    .post("/decline", auth, decline_invite)
    .post("/cancel", auth, cancel_invite)
    .post("/board", auth, get_board_invites)
    .post("/my", auth, get_my_invites);

export default router;
