import { buildReport, monthOf } from "./report.calc.js";
import * as repository from "./report.repository.js";

export async function getMonthlyReport(membership, { month } = {}) {
  const { expenses, members, timezone } = await repository.loadReportInput(membership.householdId);
  return buildReport({
    expenses,
    members: members.map((m) => ({ userId: m.userId, name: m.user.name, active: m.status === "active" })),
    month: month ?? monthOf(new Date(), timezone),
    timeZone: timezone,
  });
}
