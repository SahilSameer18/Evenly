import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import * as controller from "./users.controller.js";

const router = Router();

router.get("/me", authenticate, controller.me);

export default router;
