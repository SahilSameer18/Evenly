import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { householdMembership } from "../../middlewares/householdMembership.js";
import { validate } from "../../middlewares/validate.js";
import { createHouseholdBody, householdParams } from "./household.validation.js";
import * as controller from "./household.controller.js";

const router = Router();
router.use(authenticate);

router.post("/", validate({ body: createHouseholdBody }), controller.create);
router.get("/", controller.list);

// Every route with :householdId must run householdMembership after validating the params.
router.get("/:householdId", validate({ params: householdParams }), householdMembership, controller.get);

export default router;
