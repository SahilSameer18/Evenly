import { randomUUID } from "node:crypto";
import { LedgerError, splitByBasisPoints, splitByWeights, splitEqual, splitExact } from "../../ledger/index.js";
import { hashRequest } from "../../utils/canonicalHash.js";
import { decodeCursor, encodeCursor } from "../../utils/cursor.js";
import { AppError, NotFoundError, ValidationError } from "../../utils/errors.js";
import * as repository from "./expense.repository.js";

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
  try {
    if (body.type === "personal") return { splitMethod: "exact", splits: [{ userId: paidById, shareMinor: body.amountMinor }] };
    if (body.type === "on_behalf") return { splitMethod: "exact", splits: [{ userId: body.beneficiaryId, shareMinor: body.amountMinor }] };
    return { splitMethod: body.split.method, splits: splitShared(body.amountMinor, body.split, seed) };
  } catch (err) {
    // A split that is well formed but cannot be done (bad total, bps not 10000, duplicate person) is a 422.
    if (err instanceof LedgerError) throw new AppError(422, err.code, err.message);
    throw err;
  }
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

export async function createExpense(membership, body, { idempotencyKey, requestId }) {
  const { householdId, userId } = membership;

  // The hash covers the household too, so reusing a key in another household counts as a different request.
  const requestHash = hashRequest({ householdId, body });
  const stored = await storedResult(userId, idempotencyKey, requestHash);
  if (stored) return stored;

  const paidById = body.type === "personal" ? userId : (body.paidById ?? userId);
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

  const id = randomUUID();
  const { splitMethod, splits } = buildSplits(body, paidById, id);
  if (splits.reduce((sum, s) => sum + s.shareMinor, 0) !== body.amountMinor) {
    throw new Error("Split does not add up to the amount"); // the ledger guarantees this; a 500 here means a bug
  }

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

  try {
    return { expense: await repository.createExpense(householdId, expense, { actorUserId: userId, requestId }), replayed: false };
  } catch (err) {
    // Two identical requests at once: the unique index let one insert win. This one returns the winner's result.
    if (err.code === "P2002") {
      const winner = await storedResult(userId, idempotencyKey, requestHash);
      if (winner) return winner;
    }
    throw err;
  }
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
