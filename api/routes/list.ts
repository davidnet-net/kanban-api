import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { add_list, delete_list, get_cards, move_list } from "../controllers/lists.ts";
import auth from "../middlewares/auth.ts";


const router = new Router();

router
    .post("/cards", get_cards)
    .post("/add", auth, add_list)
    .post("/move", auth, move_list)
    .post("/delete", auth, delete_list)

export default router;
