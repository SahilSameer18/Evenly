import { Router } from "express";
import { idempotencyKey } from "../../middlewares/idempotency.js";
import { validate } from "../../middlewares/validate.js";
import { createSettlementBody, listSettlementsQuery, rejectBody, settlementParams } from "./settlement.validation.js";
import * as controller from "./settlement.controller.js";

// Mounted at /households/:householdId/settlements, after authenticate and householdMembership.
const router = Router({ mergeParams: true });

router.post("/", idempotencyKey, validate({ body: createSettlementBody }), controller.create);
router.get("/", validate({ query: listSettlementsQuery }), controller.list);

router.get("/:settlementId", validate({ params: settlementParams }), controller.get);
router.post("/:settlementId/confirm", validate({ params: settlementParams }), controller.confirm);
router.post("/:settlementId/reject", validate({ params: settlementParams, body: rejectBody }), controller.reject);
router.post("/:settlementId/cancel", validate({ params: settlementParams }), controller.cancel);

export default router;
