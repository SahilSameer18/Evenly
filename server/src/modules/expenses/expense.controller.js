import { sendData } from "../../utils/response.js";
import * as service from "./expense.service.js";

export async function create(req, res) {
  const { expense, replayed } = await service.createExpense(req.membership, req.valid.body, {
    idempotencyKey: req.idempotencyKey,
    requestId: req.id,
  });
  // A retry gets the original answer, status included; the header tells the client it was a replay.
  if (replayed) res.set("Idempotent-Replayed", "true");
  sendData(req, res, { expense }, 201);
}

export async function list(req, res) {
  const { expenses, pagination } = await service.listExpenses(req.membership, req.valid.query);
  sendData(req, res, { expenses }, 200, { pagination });
}

export async function get(req, res) {
  sendData(req, res, { expense: await service.getExpense(req.membership, req.valid.params.expenseId) });
}
