import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { list_boards, favorite_boards, recent_boards } from "../controllers/boards.ts";
import auth from "../middlewares/auth.ts";

const router = new Router();

router
    .get("/list", auth, list_boards)
    .get("/favorites", auth, favorite_boards)
    .get("/recent", auth, recent_boards)

export default router;
