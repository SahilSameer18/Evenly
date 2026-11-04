import { sendData } from "../../utils/response.js";
import * as balances from "../balances/balance.service.js";
import * as service from "./settlement.service.js";

const checkContext = (req) => ({ householdId: req.membership.householdId, log: req.log, requestId: req.id });

export async function create(req, res) {
  const { settlement, replayed } = await service.createSettlement(req.membership, req.valid.body, {
    idempotencyKey: req.idempotencyKey,
    requestId: req.id,
  });
  // A retry gets the original answer, status included; the header tells the client it was a replay.
  if (replayed) res.set("Idempotent-Replayed", "true");
  sendData(req, res, { settlement }, 201);
}

export async function list(req, res) {
  const { settlements, pagination } = await service.listSettlements(req.membership, req.valid.query);
  sendData(req, res, { settlements }, 200, { pagination });
}

export async function get(req, res) {
  sendData(req, res, { settlement: await service.getSettlement(req.membership, req.valid.params.settlementId) });
}

// Confirming is the one move that changes money, so it checks the books afterwards and returns the new balances.
export async function confirm(req, res) {
  const settlement = await service.confirmSettlement(req.membership, req.valid.params.settlementId, { requestId: req.id });
  sendData(req, res, { settlement, balanceAfter: await balances.reconcile(checkContext(req)) });
}

export async function reject(req, res) {
  const settlement = await service.rejectSettlement(req.membership, req.valid.params.settlementId, req.valid.body, { requestId: req.id });
  sendData(req, res, { settlement });
}

export async function cancel(req, res) {
  const settlement = await service.cancelSettlement(req.membership, req.valid.params.settlementId, { requestId: req.id });
  sendData(req, res, { settlement });
}
