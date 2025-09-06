import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { dockerhealth, health } from "../controllers/health.ts";

const router = new Router();

router
	.get("/", health)
	.get("/docker", dockerhealth);

export default router;
