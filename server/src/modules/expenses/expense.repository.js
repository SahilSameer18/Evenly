import prisma from "../../lib/prisma.js";

// Tenant rule: every function takes householdId first and cannot run without it.
function scoped(householdId) {
  if (typeof householdId !== "string" || !householdId) throw new Error("householdId is required");
  return householdId;
}

export function findExpenseById(householdId, id) {
  return prisma.expense.findFirst({ where: { id, householdId: scoped(householdId) }, include: { splits: true } });
}

export function listExpenses(householdId, { take = 25 } = {}) {
  return prisma.expense.findMany({
    where: { householdId: scoped(householdId) },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take,
    include: { splits: true },
  });
}
