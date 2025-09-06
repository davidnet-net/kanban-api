import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import health from "./health.ts";
import boards from "./boards.ts";
import board from "./board.ts";

const router = new Router();

router.use("/health", health.routes(), health.allowedMethods());
router.use("/boards", boards.routes(), boards.allowedMethods());
router.use("/board", board.routes(), board.allowedMethods());

export default router;
