import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { am_i_member, create_board, delete_board, edit_board, favorite_board, get_board, get_board_ics, get_board_members, get_lists, is_favorited, leave_board, remove_board_member, set_board_background, unfavorite_board } from "../controllers/board.ts";
import auth from "../middlewares/auth.ts";
import { wsRouter } from "../controllers/board-live.ts";


const router = new Router();

router
    .post("/get", get_board)
    .post("/create", auth, create_board)
    .post("/favorite", auth, favorite_board)
    .post("/unfavorite", auth, unfavorite_board)
    .post("/lists", get_lists)
    .post("/is_favorited", auth, is_favorited)
    .post("/delete", auth, delete_board)
    .post("/am_i_member", auth, am_i_member)
    .post("/edit", auth, edit_board)
    .post("/get_board_members", auth, get_board_members)
    .post("/remove_member", auth, remove_board_member)
    .post("/leave", auth, leave_board)
    .post("/set-background", auth, set_board_background);
    router.get("/ics/:id/:token", get_board_ics);
    router.use("/live", wsRouter.routes(), wsRouter.allowedMethods());

export default router;
