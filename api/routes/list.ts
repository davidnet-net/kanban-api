import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { get_cards } from "../controllers/lists.ts";
//import auth from "../middlewares/auth.ts";


const router = new Router();

router
    .post("/cards", get_cards)

export default router;
