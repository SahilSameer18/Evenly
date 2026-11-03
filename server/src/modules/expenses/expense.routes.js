import { Router } from "express";
import { idempotencyKey } from "../../middlewares/idempotency.js";
import { validate } from "../../middlewares/validate.js";
import { createExpenseBody, expenseParams, listExpensesQuery } from "./expense.validation.js";
import * as controller from "./expense.controller.js";

// Mounted at /households/:householdId/expenses, after authenticate and householdMembership.
const router = Router({ mergeParams: true });

router.post("/", idempotencyKey, validate({ body: createExpenseBody }), controller.create);
router.get("/", validate({ query: listExpensesQuery }), controller.list);
router.get("/:expenseId", validate({ params: expenseParams }), controller.get);

export default router;
