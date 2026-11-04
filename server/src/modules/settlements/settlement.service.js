import { randomUUID } from "node:crypto";
import { hashRequest } from "../../utils/canonicalHash.js";
import { decodeCursor, encodeCursor } from "../../utils/cursor.js";
import { AppError, ForbiddenError, NotFoundError, ValidationError } from "../../utils/errors.js";
import * as repository from "./settlement.repository.js";

// A stored result is returned only when the retry is the same request. A reused key with another request is refused.
async function storedResult(userId, idempotencyKey, requestHash) {
  const existing = await repository.findSettlementByIdempotencyKey(userId, idempotencyKey);
  if (!existing) return null;
  if (existing.requestHash !== requestHash) {
    throw new AppError(422, "IDEMPOTENCY_KEY_REUSED", "This Idempotency-Key was already used for a different request");
  }
  const { requestHash: _hidden, ...settlement } = existing;
  return { settlement, replayed: true };
}

// The sender is the person making the request. The repayment starts out pending and changes no balance
// until the recipient confirms it.
export async function createSettlement(membership, body, { idempotencyKey, requestId }) {
  const { householdId, userId } = membership;

  const requestHash = hashRequest({ householdId, body });
  const stored = await storedResult(userId, idempotencyKey, requestHash);
  if (stored) return stored;

  if (body.toUserId === userId) {
    throw new ValidationError([{ in: "body", field: "toUserId", message: "Must be someone other than you" }]);
  }
  if (!(await repository.isActiveMember(householdId, body.toUserId))) {
    throw new ValidationError([{ in: "body", field: "toUserId", message: "Must be an active member of this household" }]);
  }

  const settlement = {
    id: randomUUID(),
    fromUserId: userId,
    toUserId: body.toUserId,
    createdById: userId,
    amountMinor: body.amountMinor,
    method: body.method,
    paymentReference: body.paymentReference ?? null,
    note: body.note ?? null,
    idempotencyKey,
    requestHash,
  };
  try {
    return { settlement: await repository.createSettlement(householdId, settlement, { actorUserId: userId, requestId }), replayed: false };
  } catch (err) {
    // Two identical requests at once: the unique index let one insert win. This one returns the winner's result.
    if (err.code === "P2002") {
      const winner = await storedResult(userId, idempotencyKey, requestHash);
      if (winner) return winner;
    }
    throw err;
  }
}

export async function getSettlement(membership, settlementId) {
  const settlement = await repository.findSettlementById(membership.householdId, settlementId);
  if (!settlement) throw new NotFoundError("Repayment not found");
  return settlement;
}

export async function listSettlements(membership, { cursor, limit, status }) {
  const after = cursor ? decodeCursor(cursor) : undefined;
  if (cursor && !after) throw new ValidationError([{ in: "query", field: "cursor", message: "Invalid cursor" }]);

  const rows = await repository.listSettlements(membership.householdId, { status, limit, after });
  const settlements = rows.slice(0, limit);
  const last = settlements.at(-1);
  const nextCursor = rows.length > limit ? encodeCursor({ occurredAt: last.initiatedAt, id: last.id }) : null;
  return { settlements, pagination: { limit, nextCursor } };
}

// Who may move a pending repayment, and to where. Confirming or rejecting is the recipient's call (nobody can
// credit themselves with money they did not receive); cancelling is the sender's, to withdraw their own claim.
const MOVES = {
  confirm: { to: "confirmed", party: "toUserId", message: "Only the person being paid can confirm or reject a repayment" },
  reject: { to: "rejected", party: "toUserId", message: "Only the person being paid can confirm or reject a repayment" },
  cancel: { to: "cancelled", party: "fromUserId", message: "Only the person who sent the repayment can cancel it" },
};

async function move(membership, settlementId, action, { reason, requestId }) {
  const { to, party, message } = MOVES[action];
  const current = await getSettlement(membership, settlementId);
  if (current[party] !== membership.userId) throw new ForbiddenError(message);

  const result = await repository.transitionSettlement(membership.householdId, settlementId, { to, reason }, { actorUserId: membership.userId, requestId });
  if (result.rejected === "NOT_FOUND") throw new NotFoundError("Repayment not found");
  if (result.rejected === "NOT_PENDING") {
    throw new AppError(409, "SETTLEMENT_NOT_PENDING", `This repayment was already ${result.status}`, { status: result.status });
  }
  return result.settlement;
}

export const confirmSettlement = (membership, id, { requestId }) => move(membership, id, "confirm", { requestId });
export const rejectSettlement = (membership, id, { reason }, { requestId }) => move(membership, id, "reject", { reason, requestId });
export const cancelSettlement = (membership, id, { requestId }) => move(membership, id, "cancel", { requestId });
