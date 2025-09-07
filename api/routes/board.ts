import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { am_i_member, create_board, delete_board, edit_board, favorite_board, get_board, get_lists, is_favorited, unfavorite_board } from "../controllers/board.ts";
import auth from "../middlewares/auth.ts";


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
    
export default router;
