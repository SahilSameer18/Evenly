import { COUNTED_STATUS, calculateMemberBalances } from "./balances.js";

/**
 * Shows the working behind calculateMemberBalances: for each member the parts of the formula
 * (Net = Paid - Share + Sent - Received), and a time-ordered list of entries, each with the change it makes
 * to every member and every member's running balance afterwards.
 *
 * Takes the same input as calculateMemberBalances. Rows may also carry `id`, `at` (a Date or ISO string, used
 * for ordering) and `label`. Personal expenses are left out entirely: they are private and never part of the
 * shared picture. Reversed expenses and unconfirmed repayments are listed but change nothing (`counted: false`).
 */
export function explainLedger({ expenses, settlements, memberIds }) {
  const net = calculateMemberBalances({ expenses, settlements, memberIds }); // validates every row first

  const zeros = () => Object.fromEntries(memberIds.map((id) => [id, 0]));
  const parts = Object.fromEntries(memberIds.map((id) => [id, { paidMinor: 0, shareMinor: 0, sentMinor: 0, receivedMinor: 0 }]));
  const entries = [];

  for (const e of expenses) {
    if (e.type === "personal") continue;
    const counted = COUNTED_STATUS.has(e.status);
    const sign = e.type === "refund" ? -1 : 1; // a refund counts the other way (see balances.js)
    const deltas = zeros();
    if (counted) {
      deltas[e.paidBy] += sign * e.amountMinor;
      parts[e.paidBy].paidMinor += sign * e.amountMinor;
      for (const s of e.splits) {
        deltas[s.userId] -= sign * s.shareMinor;
        parts[s.userId].shareMinor += sign * s.shareMinor;
      }
    }
    entries.push({ kind: e.type === "refund" ? "refund" : "expense", id: e.id, at: e.at, label: e.label, status: e.status, counted, deltas });
  }

  for (const t of settlements) {
    const counted = t.status === "confirmed";
    const deltas = zeros();
    if (counted) {
      deltas[t.fromUserId] += t.amountMinor;
      deltas[t.toUserId] -= t.amountMinor;
      parts[t.fromUserId].sentMinor += t.amountMinor;
      parts[t.toUserId].receivedMinor += t.amountMinor;
    }
    entries.push({ kind: "repayment", id: t.id, at: t.at, label: t.label, status: t.status, counted, deltas });
  }

  // Oldest first; ties fall back to the id so the order never depends on the order rows arrived in.
  const time = (entry) => (entry.at === undefined ? 0 : new Date(entry.at).getTime());
  entries.sort((a, b) => time(a) - time(b) || String(a.id).localeCompare(String(b.id)));

  const running = zeros();
  for (const entry of entries) {
    for (const [id, change] of Object.entries(entry.deltas)) running[id] += change;
    entry.running = { ...running };
  }

  const members = Object.fromEntries(memberIds.map((id) => [id, { ...parts[id], netMinor: net[id] }]));
  return { net, members, entries };
}
