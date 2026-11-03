import prisma from "../../lib/prisma.js";
import { scoped } from "../../lib/tenant.js";

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
