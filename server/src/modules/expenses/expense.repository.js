import prisma from "../../lib/prisma.js";
import { scoped } from "../../lib/tenant.js";

// Functions that take householdId call scoped() first, so they cannot run without it.
// The one that cannot is listed in UNSCOPED in __tests__/expense.repository.test.js.

// What a client may see. requestHash and idempotencyKey stay inside the server.
const EXPENSE = {
  id: true,
  householdId: true,
  description: true,
  notes: true,
  amountMinor: true,
  type: true,
  splitMethod: true,
  status: true,
  version: true,
  paidById: true,
  createdById: true,
  categoryId: true,
  occurredAt: true,
  createdAt: true,
  splits: { select: { userId: true, shareMinor: true }, orderBy: { userId: "asc" } },
};

// Personal expenses belong to their creator alone. Every read applies this, so no query can forget it.
const visibleTo = (viewerId) => ({ OR: [{ type: { not: "personal" } }, { createdById: viewerId }] });

export function listActiveMemberIds(householdId) {
  return prisma.householdMember
    .findMany({ where: { householdId: scoped(householdId), status: "active" }, select: { userId: true } })
    .then((rows) => rows.map((r) => r.userId));
}

// A category is usable if it is a system one (no household) or belongs to this household.
export function categoryExists(householdId, categoryId) {
  return prisma.category
    .count({ where: { id: categoryId, isArchived: false, OR: [{ householdId: null }, { householdId: scoped(householdId) }] } })
    .then((n) => n > 0);
}

// The key is unique per user across all households, so this lookup cannot be scoped.
export function findExpenseByIdempotencyKey(userId, idempotencyKey) {
  return prisma.expense.findUnique({
    where: { createdById_idempotencyKey: { createdById: userId, idempotencyKey } },
    select: { ...EXPENSE, requestHash: true },
  });
}

// The expense, its splits and its audit event are written together or not at all.
// The deferred database trigger also refuses the commit if the splits do not add up to the amount.
export function createExpense(householdId, expense, { actorUserId, requestId }) {
  scoped(householdId);
  const { splits, ...fields } = expense;
  return prisma.$transaction(async (tx) => {
    const created = await tx.expense.create({
      data: { ...fields, householdId, splits: { create: splits.map((s) => ({ householdId, userId: s.userId, shareMinor: s.shareMinor })) } },
      select: EXPENSE,
    });
    await tx.auditEvent.create({
      data: {
        householdId,
        actorUserId,
        entityType: "expense",
        entityId: created.id,
        action: "expense.created",
        after: {
          description: created.description,
          amountMinor: created.amountMinor,
          type: created.type,
          splitMethod: created.splitMethod,
          status: created.status,
          paidById: created.paidById,
          createdById: created.createdById,
          categoryId: created.categoryId,
          occurredAt: created.occurredAt.toISOString(),
          splits: created.splits,
        },
        requestId,
      },
    });
    return created;
  });
}

export function findExpenseById(householdId, id, viewerId) {
  return prisma.expense.findFirst({
    where: { id, householdId: scoped(householdId), AND: [visibleTo(viewerId)] },
    select: EXPENSE,
  });
}

/** Newest first, ties broken by id. Returns up to limit + 1 rows so the caller can tell whether a next page exists. */
export function listExpenses(householdId, viewerId, { filters = {}, limit = 25, after } = {}) {
  const { from, to, categoryId, paidById, type, status, q } = filters;
  const and = [visibleTo(viewerId)];
  if (from) and.push({ occurredAt: { gte: from } });
  if (to) and.push({ occurredAt: { lte: to } });
  if (categoryId) and.push({ categoryId });
  if (paidById) and.push({ paidById });
  if (type) and.push({ type });
  if (status) and.push({ status });
  if (q) and.push({ OR: [{ description: { contains: q, mode: "insensitive" } }, { notes: { contains: q, mode: "insensitive" } }] });
  if (after) and.push({ OR: [{ occurredAt: { lt: after.occurredAt } }, { occurredAt: after.occurredAt, id: { lt: after.id } }] });

  return prisma.expense.findMany({
    where: { householdId: scoped(householdId), AND: and },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    select: EXPENSE,
  });
}
