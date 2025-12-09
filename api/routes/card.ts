import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { add_card, change_card_title, create_checklist_item, delete_checklist_item, move_card, update_card_description, delete_card, update_card_color, get_checklists, toggle_checklist_item, change_card_dates, get_cards_due_today, get_card} from "../controllers/cards.ts";
import auth from "../middlewares/auth.ts";


const router = new Router();

router
    .post("/add", auth, add_card)
    .post("/move", auth, move_card)
    .post("/delete", auth, delete_card)
    .post("/update_color", auth, update_card_color)
    .post("/change-title", auth, change_card_title)
    .post("/create-checklist-item", auth, create_checklist_item)
    .post("/delete-checklist-item", auth, delete_checklist_item)
    .post("/change-description", auth, update_card_description)
    .post("/get-checklist", auth, get_checklists)
    .post("/toggle-checklist-item", auth, toggle_checklist_item)
    .post("/change-dates", auth, change_card_dates)
    .get("/due-today", auth, get_cards_due_today)
    .post("/get", auth, get_card)

export default router;
