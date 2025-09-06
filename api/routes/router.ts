import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import health from "./health.ts";
//import auth from "../middlewares/auth.ts";

const router = new Router();

router.use("/health", health.routes(), health.allowedMethods());
// If AUTH is needed add [auth] like below
//router.use("/health", auth, health.routes(), health.allowedMethods());

export default router;
