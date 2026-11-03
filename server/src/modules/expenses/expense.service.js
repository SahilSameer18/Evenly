import { randomUUID } from "node:crypto";
import {
  LedgerError,
  calculateRefundShares,
  splitByBasisPoints,
  splitByWeights,
  splitEqual,
  splitExact,
} from "../../ledger/index.js";
import { hashRequest } from "../../utils/canonicalHash.js";
import { decodeCursor, encodeCursor } from "../../utils/cursor.js";
import { AppError, ForbiddenError, NotFoundError, ValidationError } from "../../utils/errors.js";
import * as repository from "./expense.repository.js";

// A split that is well formed but cannot be done (bad total, bps not 10000, duplicate person) is a 422.
function ledgerOr422(fn) {
  try {
    return fn();
  } catch (err) {
    if (err instanceof LedgerError) throw new AppError(422, err.code, err.message);
    throw err;
  }
}

// Splits the amount for a shared expense. The expense id seeds the tie-break for leftover paise.
function splitShared(amountMinor, split, seed) {
  switch (split.method) {
    case "equal":
      return splitEqual(amountMinor, split.participants, seed);
    case "exact":
      return splitExact(amountMinor, split.shares);
    case "percentage":
      return splitByBasisPoints(amountMinor, split.parts, seed);
    case "weights":
      return splitByWeights(amountMinor, split.parts, seed);
  }
}

function buildSplits(body, paidById, seed) {
  return ledgerOr422(() => {
    if (body.type === "personal") return { splitMethod: "exact", splits: [{ userId: paidById, shareMinor: body.amountMinor }] };
    if (body.type === "on_behalf") return { splitMethod: "exact", splits: [{ userId: body.beneficiaryId, shareMinor: body.amountMinor }] };
    return { splitMethod: body.split.method, splits: splitShared(body.amountMinor, body.split, seed) };
  });
}

// Every person named in the request, with the field to blame if they are not a member.
function namedPeople(body, paidById) {
  const named = [["paidById", paidById]];
  if (body.type === "on_behalf") named.push(["beneficiaryId", body.beneficiaryId]);
  if (body.type === "shared") {
    const { split } = body;
    if (split.method === "equal") split.participants.forEach((id, i) => named.push([`split.participants.${i}`, id]));
    if (split.method === "exact") split.shares.forEach((s, i) => named.push([`split.shares.${i}.userId`, s.userId]));
    if (split.method === "percentage" || split.method === "weights") split.parts.forEach((p, i) => named.push([`split.parts.${i}.userId`, p.userId]));
  }
  return named;
}

// Used by create and edit. Everyone named must be an active member and the category must be usable;
// then the amount is split. Returns the method and the splits to store.
async function prepare(membership, body, { paidById, seed }) {
  const { householdId } = membership;
  const members = new Set(await repository.listActiveMemberIds(householdId));
  const problems = namedPeople(body, paidById)
    .filter(([, id]) => !members.has(id))
    .map(([field]) => ({ in: "body", field, message: "Must be an active member of this household" }));
  if (body.type === "on_behalf" && body.beneficiaryId === paidById) {
    problems.push({ in: "body", field: "beneficiaryId", message: "Must be someone other than the payer" });
  }
  if (body.categoryId && !(await repository.categoryExists(householdId, body.categoryId))) {
    problems.push({ in: "body", field: "categoryId", message: "Unknown category" });
  }
  if (problems.length > 0) throw new ValidationError(problems);

  const { splitMethod, splits } = buildSplits(body, paidById, seed);
  if (splits.reduce((sum, s) => sum + s.shareMinor, 0) !== body.amountMinor) {
    throw new Error("Split does not add up to the amount"); // the ledger guarantees this; a 500 here means a bug
  }
  return { splitMethod, splits };
}

// A stored result is returned only when the retry is the same request. A reused key with another request is refused.
async function storedResult(userId, idempotencyKey, requestHash) {
  const existing = await repository.findExpenseByIdempotencyKey(userId, idempotencyKey);
  if (!existing) return null;
  if (existing.requestHash !== requestHash) {
    throw new AppError(422, "IDEMPOTENCY_KEY_REUSED", "This Idempotency-Key was already used for a different request");
  }
  const { requestHash: _hidden, ...expense } = existing;
  return { expense, replayed: true };
}

// Runs a create and, if two identical requests raced, answers the loser with the winner's row.
async function createOrReplay(userId, idempotencyKey, requestHash, create) {
  try {
    return { expense: await create(), replayed: false };
  } catch (err) {
    if (err.code === "P2002") {
      const winner = await storedResult(userId, idempotencyKey, requestHash);
      if (winner) return winner;
    }
    throw err;
  }
}

export async function createExpense(membership, body, { idempotencyKey, requestId }) {
  const { householdId, userId } = membership;

  // The hash covers the household too, so reusing a key in another household counts as a different request.
  const requestHash = hashRequest({ householdId, body });
  const stored = await storedResult(userId, idempotencyKey, requestHash);
  if (stored) return stored;

  const id = randomUUID();
  const paidById = body.type === "personal" ? userId : (body.paidById ?? userId);
  const { splitMethod, splits } = await prepare(membership, body, { paidById, seed: id });

  const expense = {
    id,
    createdById: userId,
    paidById,
    categoryId: body.categoryId ?? null,
    description: body.description,
    notes: body.notes || null,
    amountMinor: body.amountMinor,
    type: body.type,
    splitMethod,
    occurredAt: body.occurredAt ?? new Date(),
    idempotencyKey,
    requestHash,
    splits,
  };
  return createOrReplay(userId, idempotencyKey, requestHash, () =>
    repository.createExpense(householdId, expense, { actorUserId: userId, requestId }),
  );
}

export async function listExpenses(membership, query) {
  const { cursor, limit, ...filters } = query;
  const after = cursor ? decodeCursor(cursor) : undefined;
  if (cursor && !after) throw new ValidationError([{ in: "query", field: "cursor", message: "Invalid cursor" }]);

  const rows = await repository.listExpenses(membership.householdId, membership.userId, { filters, limit, after });
  const expenses = rows.slice(0, limit);
  const nextCursor = rows.length > limit ? encodeCursor(expenses.at(-1)) : null;
  return { expenses, pagination: { limit, nextCursor } };
}

export async function getExpense(membership, expenseId) {
  // Missing, in another household, or someone else's personal expense: all the same answer.
  const expense = await repository.findExpenseById(membership.householdId, expenseId, membership.userId);
  if (!expense) throw new NotFoundError("Expense not found");
  return expense;
}

// ---- lifecycle -------------------------------------------------------------------------------------------

// How a refusal from the repository becomes an HTTP error.
const REFUSALS = {
  NOT_FOUND: () => new NotFoundError("Expense not found"),
  REVERSED: () => new AppError(409, "EXPENSE_REVERSED", "This expense has been reversed"),
  HAS_REFUNDS: () => new AppError(409, "HAS_REFUNDS", "This expense has refunds: reverse them first"),
  STALE: (r) =>
    new AppError(409, "STALE_VERSION", "This expense was changed by someone else: reload it and try again", { currentVersion: r.currentVersion }),
  ALREADY_DISPUTED: () => new AppError(409, "ALREADY_DISPUTED", "This expense is already disputed"),
  NOT_DISPUTED: () => new AppError(409, "NOT_DISPUTED", "This expense is not disputed"),
  NOT_DISPUTER: () => new ForbiddenError("Only the person who raised the dispute can withdraw it"),
  NOT_REFUNDABLE: () => new AppError(409, "NOT_REFUNDABLE", "Only a shared or on-behalf expense that is not reversed can be refunded"),
  EXCEEDS_ORIGINAL: (r) =>
    new AppError(422, "REFUND_EXCEEDS_ORIGINAL", "Refunds cannot add up to more than the original amount", { refundableMinor: r.refundableMinor }),
};
const unwrap = (result) => {
  if (result.rejected) throw REFUSALS[result.rejected](result);
  return result;
};
const creatorOnly = (membership, expense) => {
  if (expense.createdById !== membership.userId) throw new ForbiddenError("Only the person who recorded this expense can do that");
};

export async function updateExpense(membership, expenseId, body, { requestId }) {
  const { householdId, userId } = membership;
  const current = await getExpense(membership, expenseId);
  creatorOnly(membership, current);
  if (current.type === "refund") throw new AppError(409, "REFUND_NOT_EDITABLE", "A refund cannot be edited: reverse it and record a new one");
  if (current.status === "reversed") throw REFUSALS.REVERSED();
  if (body.type !== current.type) throw new AppError(422, "TYPE_CANNOT_CHANGE", "The type of an expense cannot be changed");

  // The body replaces the whole expense, except the payer and the date, which stay as they were if not sent.
  const { version, ...content } = body;
  const paidById = current.type === "personal" ? userId : (content.paidById ?? current.paidById);
  const { splitMethod, splits } = await prepare(membership, content, { paidById, seed: expenseId });
  const fields = {
    description: content.description,
    notes: content.notes || null,
    amountMinor: content.amountMinor,
    categoryId: content.categoryId ?? null,
    paidById,
    splitMethod,
    occurredAt: content.occurredAt ?? current.occurredAt,
  };
  const result = await repository.updateExpense(householdId, expenseId, { expectedVersion: version, fields, splits }, { actorUserId: userId, requestId });
  return unwrap(result).expense;
}

export async function reverseExpense(membership, expenseId, { reason }, { requestId }) {
  const current = await getExpense(membership, expenseId);
  creatorOnly(membership, current);
  const result = await repository.reverseExpense(membership.householdId, expenseId, { reason }, { actorUserId: membership.userId, requestId });
  return unwrap(result).expense; // reversing twice returns the same reversed expense and writes nothing new
}

export async function disputeExpense(membership, expenseId, { reason }, { requestId }) {
  const current = await getExpense(membership, expenseId);
  if (current.createdById === membership.userId) {
    throw new ForbiddenError("You cannot dispute your own expense: edit or reverse it instead");
  }
  const result = await repository.disputeExpense(membership.householdId, expenseId, { reason }, { actorUserId: membership.userId, requestId });
  return unwrap(result).expense;
}

export async function withdrawDispute(membership, expenseId, { requestId }) {
  await getExpense(membership, expenseId); // 404 if it does not exist or is someone else's personal expense
  const result = await repository.withdrawDispute(membership.householdId, expenseId, { actorUserId: membership.userId, requestId });
  return unwrap(result).expense;
}

export async function refundExpense(membership, expenseId, body, { idempotencyKey, requestId }) {
  const { householdId, userId } = membership;

  const requestHash = hashRequest({ householdId, expenseId, body });
  const stored = await storedResult(userId, idempotencyKey, requestHash);
  if (stored) return stored;

  const original = await getExpense(membership, expenseId);
  if (!["shared", "on_behalf"].includes(original.type) || original.status === "reversed") throw REFUSALS.NOT_REFUNDABLE();
  if (body.amountMinor > original.amountMinor) throw REFUSALS.EXCEEDS_ORIGINAL({ refundableMinor: original.amountMinor });

  // The refund is shared back in the same proportions as the original, seeded with its own id.
  const id = randomUUID();
  const splits = ledgerOr422(() => calculateRefundShares(original.splits, body.amountMinor, id));
  const refund = {
    id,
    createdById: userId,
    paidById: original.paidById, // the person who paid originally is the one who gets the money back
    categoryId: original.categoryId,
    description: `Refund: ${original.description}`.slice(0, 140),
    notes: body.notes || null,
    amountMinor: body.amountMinor,
    type: "refund",
    splitMethod: "weights",
    occurredAt: body.occurredAt ?? new Date(),
    refundOfId: original.id,
    idempotencyKey,
    requestHash,
    splits,
  };
  return createOrReplay(userId, idempotencyKey, requestHash, async () => {
    const result = await repository.createRefund(householdId, refund, { actorUserId: userId, requestId }, { originalVersion: original.version });
    return unwrap(result).expense;
  });
}

export async function getHistory(membership, expenseId) {
  await getExpense(membership, expenseId); // same visibility rules as the expense itself
  return repository.listHistory(membership.householdId, expenseId);
}
