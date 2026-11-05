import { COUNTED_STATUS } from "../../ledger/balances.js";

const pad = (n) => String(n).padStart(2, "0");

/** The "YYYY-MM" an instant falls in on the wall clock of `timeZone` (00:10 IST on 1 Nov is still October in UTC). */
export function monthOf(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit" }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get("year")}-${get("month")}`;
}

/** "2026-11" plus n months, across year ends in both directions. */
export function addMonths(month, n) {
  const [year, m] = month.split("-").map(Number);
  const total = year * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
}

/**
 * One month of shared spending, worked out from the stored expenses (nothing is stored; same rules as the ledger):
 * personal and reversed expenses never count, disputed ones do, and a refund counts the other way.
 * `trend` is the last `months` months ending at `month`, with empty months as 0 so the shape never has gaps.
 * A refund belongs to the month it was recorded in, not to the month of the expense it refunds.
 * @param {{ expenses: object[], members: { userId: string, name: string, active: boolean }[], month: string, timeZone: string, months?: number }} input
 */
export function buildReport({ expenses, members, month, timeZone, months = 6 }) {
  const trendMonths = Array.from({ length: months }, (_, i) => addMonths(month, i - (months - 1)));
  const spend = Object.fromEntries(trendMonths.map((m) => [m, 0]));
  const people = new Map(members.map((m) => [m.userId, { userId: m.userId, name: m.name, active: m.active, paidMinor: 0, shareMinor: 0 }]));

  for (const e of expenses) {
    if (e.type === "personal" || !COUNTED_STATUS.has(e.status)) continue;
    const when = monthOf(e.occurredAt, timeZone);
    if (!Object.hasOwn(spend, when)) continue;
    const sign = e.type === "refund" ? -1 : 1;
    spend[when] += sign * e.amountMinor;
    if (when !== month) continue;
    const payer = people.get(e.paidById);
    if (payer) payer.paidMinor += sign * e.amountMinor;
    for (const s of e.splits) {
      const person = people.get(s.userId);
      if (person) person.shareMinor += sign * s.shareMinor;
    }
  }

  // Current members always show; someone who left shows only if they took part this month.
  const shown = [...people.values()]
    .filter((p) => p.active || p.paidMinor !== 0 || p.shareMinor !== 0)
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));

  return {
    month,
    timezone: timeZone,
    spendMinor: spend[month],
    previousSpendMinor: months >= 2 ? spend[addMonths(month, -1)] : 0,
    members: shown,
    trend: trendMonths.map((m) => ({ month: m, spendMinor: spend[m] })),
  };
}
