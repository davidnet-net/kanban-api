import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { create_board, get_board, get_lists } from "../controllers/board.ts";
import auth from "../middlewares/auth.ts";


const router = new Router();

router
    .post("/get", get_board)
    .post("/create", auth, create_board)
    .post("/favorite", auth, get_lists)
    .post("/lists", get_lists)

export default router;
