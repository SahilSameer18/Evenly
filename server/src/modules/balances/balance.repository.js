import prisma from "../../lib/prisma.js";
import { scoped } from "../../lib/tenant.js";

// Everything needed to work out the household's balances: every record, and every member ever
// (left members still own history). Other people's personal expenses are loaded too, because the
// ledger needs to see and ignore them; the service never passes them on to a client.
// shortcut: loads the whole ledger on each call; fine at household scale, revisit if ledgers grow large.
export function loadLedger(householdId) {
  scoped(householdId);
  return Promise.all([
    prisma.expense.findMany({ where: { householdId }, include: { splits: true } }),
    prisma.settlement.findMany({ where: { householdId } }),
    prisma.householdMember.findMany({ where: { householdId }, select: { userId: true, status: true, user: { select: { name: true } } } }),
  ]).then(([expenses, settlements, members]) => ({ expenses, settlements, members }));
}
