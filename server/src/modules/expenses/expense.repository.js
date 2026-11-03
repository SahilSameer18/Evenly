import prisma from "../../lib/prisma.js";
import { scoped } from "../../lib/tenant.js";

// Functions that take householdId call scoped() first, so they cannot run without it.
// The one that cannot is listed in UNSCOPED in __tests__/expense.repository.test.js.
//
// Changes to an existing expense (edit, reverse, dispute, withdraw, refund) all start the same way:
// lock the row with SELECT ... FOR UPDATE, then decide. Two people acting at once therefore line up
// one behind the other and the second sees what the first did. A refusal is returned as
// { rejected: "REASON" }, never thrown, so the transaction ends without changing anything.

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
  refundOfId: true,
  occurredAt: true,
  createdAt: true,
  splits: { select: { userId: true, shareMinor: true }, orderBy: { userId: "asc" } },
};

// Personal expenses belong to their creator alone. Every read applies this, so no query can forget it.
const visibleTo = (viewerId) => ({ OR: [{ type: { not: "personal" } }, { createdById: viewerId }] });

// What the audit trail keeps about an expense at one moment.
const snapshot = (e) => ({
  description: e.description,
  notes: e.notes,
  amountMinor: e.amountMinor,
  type: e.type,
  splitMethod: e.splitMethod,
  status: e.status,
  version: e.version,
  paidById: e.paidById,
  createdById: e.createdById,
  categoryId: e.categoryId,
  refundOfId: e.refundOfId,
  occurredAt: e.occurredAt.toISOString(),
  splits: e.splits,
});

const record = (tx, householdId, { actorUserId, requestId }, entityId, action, { before, after, reason } = {}) =>
  tx.auditEvent.create({
    data: { householdId, actorUserId, entityType: "expense", entityId, action, before, after, reason, requestId },
  });

const lock = async (tx, householdId, id) => {
  const rows = await tx.$queryRaw`SELECT "id", "version", "status", "type" FROM "Expense" WHERE "id" = ${id} AND "householdId" = ${householdId} FOR UPDATE`;
  return rows[0] ?? null;
};

const hasActiveRefunds = async (tx, id) => (await tx.expense.count({ where: { refundOfId: id, type: "refund", status: { not: "reversed" } } })) > 0;

const readExpense = (tx, id) => tx.expense.findUnique({ where: { id }, select: EXPENSE });

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

async function insert(tx, householdId, expense, audit, action) {
  const { splits, ...fields } = expense;
  const created = await tx.expense.create({
    data: { ...fields, householdId, splits: { create: splits.map((s) => ({ householdId, userId: s.userId, shareMinor: s.shareMinor })) } },
    select: EXPENSE,
  });
  await record(tx, householdId, audit, created.id, action, { after: snapshot(created) });
  return created;
}

// The expense, its splits and its audit event are written together or not at all.
// The deferred database trigger also refuses the commit if the splits do not add up to the amount.
export function createExpense(householdId, expense, audit) {
  scoped(householdId);
  return prisma.$transaction((tx) => insert(tx, householdId, expense, audit, "expense.created"));
}

/**
 * Records a refund against an earlier expense. Locks that expense first, so two refunds at once
 * cannot together go over the original amount, and the original cannot be edited or reversed meanwhile.
 * originalVersion is the version the refund shares were worked out from; if it moved, the shares are stale.
 */
export function createRefund(householdId, refund, audit, { originalVersion }) {
  scoped(householdId);
  return prisma.$transaction(async (tx) => {
    const original = await lock(tx, householdId, refund.refundOfId);
    if (!original) return { rejected: "NOT_FOUND" };
    if (!["shared", "on_behalf"].includes(original.type) || original.status === "reversed") return { rejected: "NOT_REFUNDABLE" };
    if (original.version !== originalVersion) return { rejected: "STALE", currentVersion: original.version };

    const full = await readExpense(tx, original.id);
    const already = await tx.expense.aggregate({
      where: { refundOfId: original.id, type: "refund", status: { not: "reversed" } },
      _sum: { amountMinor: true },
    });
    const refundable = full.amountMinor - (already._sum.amountMinor ?? 0);
    if (refund.amountMinor > refundable) return { rejected: "EXCEEDS_ORIGINAL", refundableMinor: refundable };

    return { expense: await insert(tx, householdId, refund, audit, "expense.refunded") };
  });
}

/** Replaces an expense's content. Refused if it is reversed, has refunds, or the version is not the current one. */
export function updateExpense(householdId, id, { expectedVersion, fields, splits }, audit) {
  scoped(householdId);
  return prisma.$transaction(async (tx) => {
    const row = await lock(tx, householdId, id);
    if (!row) return { rejected: "NOT_FOUND" };
    if (row.status === "reversed") return { rejected: "REVERSED" };
    if (row.version !== expectedVersion) return { rejected: "STALE", currentVersion: row.version };
    if (await hasActiveRefunds(tx, id)) return { rejected: "HAS_REFUNDS" };

    const before = await readExpense(tx, id);
    // An edit settles any open dispute, so the status goes back to confirmed.
    await tx.expense.update({ where: { id }, data: { ...fields, status: "confirmed", version: { increment: 1 } } });
    // The old splits live on in the audit event's "before" snapshot.
    await tx.expenseSplit.deleteMany({ where: { expenseId: id } });
    await tx.expenseSplit.createMany({ data: splits.map((s) => ({ expenseId: id, householdId, userId: s.userId, shareMinor: s.shareMinor })) });
    const after = await readExpense(tx, id);
    await record(tx, householdId, audit, id, "expense.updated", { before: snapshot(before), after: snapshot(after) });
    return { expense: after };
  });
}

/** Marks an expense reversed. The row stays; the ledger ignores reversed expenses. Safe to repeat. */
export function reverseExpense(householdId, id, { reason }, audit) {
  scoped(householdId);
  return prisma.$transaction(async (tx) => {
    const row = await lock(tx, householdId, id);
    if (!row) return { rejected: "NOT_FOUND" };
    if (row.status === "reversed") return { expense: await readExpense(tx, id), alreadyReversed: true };
    if (await hasActiveRefunds(tx, id)) return { rejected: "HAS_REFUNDS" };

    const before = await readExpense(tx, id);
    await tx.expense.update({ where: { id }, data: { status: "reversed", version: { increment: 1 } } });
    const after = await readExpense(tx, id);
    await record(tx, householdId, audit, id, "expense.reversed", { before: snapshot(before), after: snapshot(after), reason });
    return { expense: after };
  });
}

/** Flags a confirmed expense. It still counts in balances until it is reversed. */
export function disputeExpense(householdId, id, { reason }, audit) {
  scoped(householdId);
  return prisma.$transaction(async (tx) => {
    const row = await lock(tx, householdId, id);
    if (!row) return { rejected: "NOT_FOUND" };
    if (row.status === "reversed") return { rejected: "REVERSED" };
    if (row.status === "disputed") return { rejected: "ALREADY_DISPUTED" };

    const before = await readExpense(tx, id);
    await tx.expense.update({ where: { id }, data: { status: "disputed", version: { increment: 1 } } });
    const after = await readExpense(tx, id);
    await record(tx, householdId, audit, id, "expense.disputed", { before: snapshot(before), after: snapshot(after), reason });
    return { expense: after };
  });
}

/** Clears a dispute. Only the person who raised it (found in the audit trail) may do this. */
export function withdrawDispute(householdId, id, audit) {
  scoped(householdId);
  return prisma.$transaction(async (tx) => {
    const row = await lock(tx, householdId, id);
    if (!row) return { rejected: "NOT_FOUND" };
    if (row.status !== "disputed") return { rejected: "NOT_DISPUTED" };

    const raised = await tx.auditEvent.findFirst({
      where: { householdId, entityType: "expense", entityId: id, action: "expense.disputed" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { actorUserId: true },
    });
    if (raised?.actorUserId !== audit.actorUserId) return { rejected: "NOT_DISPUTER" };

    const before = await readExpense(tx, id);
    await tx.expense.update({ where: { id }, data: { status: "confirmed", version: { increment: 1 } } });
    const after = await readExpense(tx, id);
    await record(tx, householdId, audit, id, "expense.dispute_withdrawn", { before: snapshot(before), after: snapshot(after) });
    return { expense: after };
  });
}

export function findExpenseById(householdId, id, viewerId) {
  return prisma.expense.findFirst({
    where: { id, householdId: scoped(householdId), AND: [visibleTo(viewerId)] },
    select: EXPENSE,
  });
}

/** Everything that happened to one expense, oldest first. Audit events cannot be changed or deleted. */
export function listHistory(householdId, expenseId) {
  return prisma.auditEvent.findMany({
    where: { householdId: scoped(householdId), entityType: "expense", entityId: expenseId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 200, // shortcut: no paging; one expense will not have this many events in practice
    select: {
      id: true,
      action: true,
      reason: true,
      before: true,
      after: true,
      requestId: true,
      createdAt: true,
      actor: { select: { id: true, name: true } },
    },
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
