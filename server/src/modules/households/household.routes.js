import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { householdMembership } from "../../middlewares/householdMembership.js";
import { inviteLimiter } from "../../middlewares/rateLimiter.js";
import { validate } from "../../middlewares/validate.js";
import { acceptBody, createHouseholdBody, householdParams, inviteBody } from "./household.validation.js";
import * as controller from "./household.controller.js";

const router = Router();
router.use(authenticate);

router.post("/", validate({ body: createHouseholdBody }), controller.create);
router.get("/", controller.list);

// Every route with :householdId must run householdMembership after validating the params.
router.get("/:householdId", validate({ params: householdParams }), householdMembership, controller.get);
router.post("/:householdId/invitations", validate({ params: householdParams, body: inviteBody }), householdMembership, controller.invite);

export default router;

// The accepter is not a member yet, so this sits outside /households.
export const invitationRouter = Router();
invitationRouter.post("/accept", inviteLimiter, authenticate, validate({ body: acceptBody }), controller.accept);
