import { Router } from "express";
import { validate } from "../../middlewares/validate.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { csrfGuard } from "../../middlewares/csrfGuard.js";
import { registerLimiter, loginLimiter, refreshLimiter, passwordLimiter } from "../../middlewares/rateLimiter.js";
import { registerBody, loginBody, changePasswordBody } from "./auth.validation.js";
import * as controller from "./auth.controller.js";

const router = Router();

// Limiters come first so abusive traffic costs as little work as possible.
router.post("/register", registerLimiter, validate({ body: registerBody }), controller.register);
router.post("/login", loginLimiter, validate({ body: loginBody }), controller.login);
// These two act on the refresh cookie, so they also need the CSRF guard.
router.post("/refresh", refreshLimiter, csrfGuard, controller.refresh);
router.post("/logout", csrfGuard, controller.logout);
router.post("/change-password", passwordLimiter, authenticate, validate({ body: changePasswordBody }), controller.changePassword);

export default router;
