import prisma from "../../lib/prisma.js";
import { scoped } from "../../lib/tenant.js";
import { loadLedger } from "../balances/balance.repository.js";

// The expenses and members the report needs, plus the household's timezone (month edges are its wall clock).
// shortcut: loads every expense of the household and groups in code, like balances; revisit if ledgers grow large.
export async function loadReportInput(householdId) {
  scoped(householdId);
  const [{ expenses, members }, household] = await Promise.all([
    loadLedger(householdId),
    prisma.household.findUnique({ where: { id: householdId }, select: { timezone: true } }),
  ]);
  return { expenses, members, timezone: household.timezone };
}
