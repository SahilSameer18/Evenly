import { sendData } from "../../utils/response.js";
import * as service from "./expense.service.js";

const created = (req, res, { expense, replayed }) => {
  // A retry gets the original answer, status included; the header tells the client it was a replay.
  if (replayed) res.set("Idempotent-Replayed", "true");
  sendData(req, res, { expense }, 201);
};

export async function create(req, res) {
  created(req, res, await service.createExpense(req.membership, req.valid.body, { idempotencyKey: req.idempotencyKey, requestId: req.id }));
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
  sendData(req, res, { expense: await service.updateExpense(req.membership, expenseId, req.valid.body, { requestId: req.id }) });
}

export async function reverse(req, res) {
  const { expenseId } = req.valid.params;
  sendData(req, res, { expense: await service.reverseExpense(req.membership, expenseId, req.valid.body, { requestId: req.id }) });
}

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
  created(req, res, await service.refundExpense(req.membership, expenseId, req.valid.body, { idempotencyKey: req.idempotencyKey, requestId: req.id }));
}

export async function history(req, res) {
  const events = await service.getHistory(req.membership, req.valid.params.expenseId);
  sendData(req, res, { history: events });
}
