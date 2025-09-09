import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { user_creation, user_deletion } from "../controllers/internal.ts";

const router = new Router();

router
    .post("/user_creation", user_creation)
    .post("/user_deletion", user_deletion)

export default router;
