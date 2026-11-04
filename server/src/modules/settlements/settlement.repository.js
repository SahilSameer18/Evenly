import prisma from "../../lib/prisma.js";
import { scoped } from "../../lib/tenant.js";

// Functions that take householdId call scoped() first, so they cannot run without it.
// The one that cannot is listed in UNSCOPED in __tests__/settlement.repository.test.js.
//
// A change of status locks the row (SELECT ... FOR UPDATE) and then decides, so a confirm racing a cancel
// lines up and exactly one wins. A refusal is returned as { rejected: "REASON" }, never thrown.

// What a client may see. requestHash and idempotencyKey stay inside the server.
const SETTLEMENT = {
  id: true,
  householdId: true,
  fromUserId: true,
  toUserId: true,
  createdById: true,
  amountMinor: true,
  method: true,
  paymentReference: true,
  note: true,
  status: true,
  initiatedAt: true,
  confirmedAt: true,
  resolvedAt: true,
};

const snapshot = (s) => ({
  fromUserId: s.fromUserId,
  toUserId: s.toUserId,
  amountMinor: s.amountMinor,
  method: s.method,
  paymentReference: s.paymentReference,
  note: s.note,
  status: s.status,
});

const record = (tx, householdId, { actorUserId, requestId }, entityId, action, { before, after, reason } = {}) =>
  tx.auditEvent.create({
    data: { householdId, actorUserId, entityType: "settlement", entityId, action, before, after, reason, requestId },
  });

export function isActiveMember(householdId, userId) {
  return prisma.householdMember.count({ where: { householdId: scoped(householdId), userId, status: "active" } }).then((n) => n > 0);
}

// The key is unique per user across all households, so this lookup cannot be scoped.
export function findSettlementByIdempotencyKey(userId, idempotencyKey) {
  return prisma.settlement.findUnique({
    where: { createdById_idempotencyKey: { createdById: userId, idempotencyKey } },
    select: { ...SETTLEMENT, requestHash: true },
  });
}

export function findSettlementById(householdId, id) {
  return prisma.settlement.findFirst({ where: { id, householdId: scoped(householdId) }, select: SETTLEMENT });
}

/** Newest first, ties broken by id. Returns up to limit + 1 rows so the caller can tell whether a next page exists. */
export function listSettlements(householdId, { status, limit = 25, after } = {}) {
  const and = [];
  if (status) and.push({ status });
  // The cursor carries { occurredAt, id }; for repayments the date is initiatedAt.
  if (after) and.push({ OR: [{ initiatedAt: { lt: after.occurredAt } }, { initiatedAt: after.occurredAt, id: { lt: after.id } }] });
  return prisma.settlement.findMany({
    where: { householdId: scoped(householdId), AND: and },
    orderBy: [{ initiatedAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    select: SETTLEMENT,
  });
}

// The repayment and its audit event are written together or not at all.
export function createSettlement(householdId, settlement, audit) {
  scoped(householdId);
  return prisma.$transaction(async (tx) => {
    const created = await tx.settlement.create({ data: { ...settlement, householdId }, select: SETTLEMENT });
    await record(tx, householdId, audit, created.id, "settlement.created", { after: snapshot(created) });
    return created;
  });
}

/**
 * Moves a pending repayment to confirmed, rejected or cancelled. Repeating the same move is not an error: it
 * returns the repayment as it is, with unchanged: true, and writes nothing. Any other move on a repayment that
 * is already settled is refused with NOT_PENDING.
 */
export function transitionSettlement(householdId, id, { to, reason }, audit) {
  scoped(householdId);
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw`SELECT "status" FROM "Settlement" WHERE "id" = ${id} AND "householdId" = ${householdId} FOR UPDATE`;
    if (!rows[0]) return { rejected: "NOT_FOUND" };
    const read = () => tx.settlement.findUnique({ where: { id }, select: SETTLEMENT });

    if (rows[0].status === to) return { settlement: await read(), unchanged: true };
    if (rows[0].status !== "pending") return { rejected: "NOT_PENDING", status: rows[0].status };

    const before = await read();
    const now = new Date();
    await tx.settlement.update({ where: { id }, data: { status: to, resolvedAt: now, ...(to === "confirmed" && { confirmedAt: now }) } });
    const after = await read();
    await record(tx, householdId, audit, id, `settlement.${to}`, { before: snapshot(before), after: snapshot(after), reason });
    return { settlement: after };
  });
}
