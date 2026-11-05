import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { householdMembership } from "../../middlewares/householdMembership.js";
import { inviteLimiter } from "../../middlewares/rateLimiter.js";
import { validate } from "../../middlewares/validate.js";
import {
  acceptBody,
  createHouseholdBody,
  householdParams,
  inviteBody,
  leaveBody,
  updateHouseholdBody,
} from "./household.validation.js";
import * as balanceController from "../balances/balance.controller.js";
import * as reportController from "../reports/report.controller.js";
import { monthlyQuery } from "../reports/report.validation.js";
import expenseRoutes from "../expenses/expense.routes.js";
import settlementRoutes from "../settlements/settlement.routes.js";
import * as controller from "./household.controller.js";

const router = Router();
router.use(authenticate);

router.post("/", validate({ body: createHouseholdBody }), controller.create);
router.get("/", controller.list);

// Every route with :householdId must run householdMembership after validating the params.
router.get("/:householdId", validate({ params: householdParams }), householdMembership, controller.get);
router.patch("/:householdId", validate({ params: householdParams, body: updateHouseholdBody }), householdMembership, controller.update);
router.post("/:householdId/invitations", validate({ params: householdParams, body: inviteBody }), householdMembership, controller.invite);
router.post("/:householdId/leave", validate({ params: householdParams, body: leaveBody }), householdMembership, controller.leave);

// Mounting once here puts the membership check in front of every expense route.
router.use("/:householdId/expenses", validate({ params: householdParams }), householdMembership, expenseRoutes);
router.use("/:householdId/settlements", validate({ params: householdParams }), householdMembership, settlementRoutes);

// Read-only views worked out by the ledger from the stored records; nothing here is ever stored.
const member = [validate({ params: householdParams }), householdMembership];
router.get("/:householdId/balances", member, balanceController.balances);
router.get("/:householdId/ledger", member, balanceController.ledger);
router.get("/:householdId/settlement-suggestions", member, balanceController.suggestions);
router.get("/:householdId/reports/monthly", validate({ params: householdParams, query: monthlyQuery }), householdMembership, reportController.monthly);

export default router;

// The accepter is not a member yet, so this sits outside /households.
export const invitationRouter = Router();
invitationRouter.post("/accept", inviteLimiter, authenticate, validate({ body: acceptBody }), controller.accept);
