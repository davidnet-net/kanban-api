import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import health from "./health.ts";
import boards from "./boards.ts";
import board from "./board.ts";
import list from "./list.ts";
import card from "./card.ts";
import internal from "./internal.ts"
import invite from "./invite.ts"

const router = new Router();

router.use("/health", health.routes(), health.allowedMethods());
router.use("/boards", boards.routes(), boards.allowedMethods());
router.use("/board", board.routes(), board.allowedMethods());
router.use("/list", list.routes(), list.allowedMethods());
router.use("/card", card.routes(), card.allowedMethods());
router.use("/internal", internal.routes(), internal.allowedMethods());
router.use("/invite", invite.routes(), invite.allowedMethods());


export default router;
