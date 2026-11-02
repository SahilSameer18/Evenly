import { Router } from "express";
import { validate } from "../../middlewares/validate.js";
import { registerBody, loginBody } from "./auth.validation.js";
import * as controller from "./auth.controller.js";

const router = Router();

router.post("/register", validate({ body: registerBody }), controller.register);
router.post("/login", validate({ body: loginBody }), controller.login);

export default router;
