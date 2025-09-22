import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { add_card, change_card_title, create_checklist_item, delete_checklist_item, move_card, update_card_description, delete_card} from "../controllers/cards.ts";
import auth from "../middlewares/auth.ts";


const router = new Router();

router
    .post("/add", auth, add_card)
    .post("/move", auth, move_card)
    .post("/delete", auth, delete_card)
    .post("/change-title", auth, change_card_title)
    .post("/create-checklist", auth, create_checklist_item)
    .post("/delete-checklist", auth, delete_checklist_item)
    .post("/change-description", auth, update_card_description)
    
export default router;
