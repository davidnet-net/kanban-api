import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { add_card, move_card } from "../controllers/cards.ts";
import auth from "../middlewares/auth.ts";


const router = new Router();

router
    .post("/add", auth, add_card)
    .post("/move", auth, move_card)

export default router;
