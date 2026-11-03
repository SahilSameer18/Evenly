import { Router } from "express";
import { idempotencyKey } from "../../middlewares/idempotency.js";
import { validate } from "../../middlewares/validate.js";
import {
  createExpenseBody,
  expenseParams,
  listExpensesQuery,
  reasonBody,
  refundBody,
  updateExpenseBody,
} from "./expense.validation.js";
import * as controller from "./expense.controller.js";

// Mounted at /households/:householdId/expenses, after authenticate and householdMembership.
const router = Router({ mergeParams: true });

router.post("/", idempotencyKey, validate({ body: createExpenseBody }), controller.create);
router.get("/", validate({ query: listExpensesQuery }), controller.list);

router.get("/:expenseId", validate({ params: expenseParams }), controller.get);
router.patch("/:expenseId", validate({ params: expenseParams, body: updateExpenseBody }), controller.update);
router.post("/:expenseId/reverse", validate({ params: expenseParams, body: reasonBody }), controller.reverse);
router.post("/:expenseId/dispute", validate({ params: expenseParams, body: reasonBody }), controller.dispute);
router.post("/:expenseId/dispute/withdraw", validate({ params: expenseParams }), controller.withdrawDispute);
router.post("/:expenseId/refunds", idempotencyKey, validate({ params: expenseParams, body: refundBody }), controller.refund);
router.get("/:expenseId/history", validate({ params: expenseParams }), controller.history);

export default router;
