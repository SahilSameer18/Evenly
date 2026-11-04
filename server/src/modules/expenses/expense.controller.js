import { sendData } from "../../utils/response.js";
import * as balances from "../balances/balance.service.js";
import * as service from "./expense.service.js";

// After a write that changes money, the books are checked (see balance.service.reconcile). It returns the
// balances as they now stand, and logs an error with the request id if they no longer add up.
const checkBooks = (req) => balances.reconcile({ householdId: req.membership.householdId, log: req.log, requestId: req.id });

const created = async (req, res, { expense, replayed }) => {
  // A retry gets the original answer, status included; the header tells the client it was a replay.
  if (replayed) res.set("Idempotent-Replayed", "true");
  sendData(req, res, { expense, balanceAfter: await checkBooks(req) }, 201);
};

export async function create(req, res) {
  await created(req, res, await service.createExpense(req.membership, req.valid.body, { idempotencyKey: req.idempotencyKey, requestId: req.id }));
}

export async function list(req, res) {
  const { expenses, pagination } = await service.listExpenses(req.membership, req.valid.query);
  sendData(req, res, { expenses }, 200, { pagination });
}

export async function get(req, res) {
  sendData(req, res, { expense: await service.getExpense(req.membership, req.valid.params.expenseId) });
}

export async function update(req, res) {
  const { expenseId } = req.valid.params;
  const expense = await service.updateExpense(req.membership, expenseId, req.valid.body, { requestId: req.id });
  await checkBooks(req);
  sendData(req, res, { expense });
}

export async function reverse(req, res) {
  const { expenseId } = req.valid.params;
  const expense = await service.reverseExpense(req.membership, expenseId, req.valid.body, { requestId: req.id });
  await checkBooks(req);
  sendData(req, res, { expense });
}

// Disputing and withdrawing change a flag, not a number, so there is nothing to re-check.
export async function dispute(req, res) {
  const { expenseId } = req.valid.params;
  sendData(req, res, { expense: await service.disputeExpense(req.membership, expenseId, req.valid.body, { requestId: req.id }) });
}

export async function withdrawDispute(req, res) {
  const { expenseId } = req.valid.params;
  sendData(req, res, { expense: await service.withdrawDispute(req.membership, expenseId, { requestId: req.id }) });
}

export async function refund(req, res) {
  const { expenseId } = req.valid.params;
  await created(req, res, await service.refundExpense(req.membership, expenseId, req.valid.body, { idempotencyKey: req.idempotencyKey, requestId: req.id }));
}

export async function history(req, res) {
  const events = await service.getHistory(req.membership, req.valid.params.expenseId);
  sendData(req, res, { history: events });
}
