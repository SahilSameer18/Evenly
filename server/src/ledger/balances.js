import { LedgerError } from "./errors.js";

// Disputed expenses still count (household default); reversed ones never do.
// A reversed refund is ignored too, which gives the refunded amount back to the original expense.
const COUNTED_STATUS = new Set(["confirmed", "disputed"]);

/**
 * Net(u) = Paid(u) - Share(u) + Sent(u) - Received(u). Positive = is owed money.
 * Personal expenses, reversed expenses and non-confirmed settlements are ignored.
 * @param {{
 *   expenses: { paidBy: string, amountMinor: number, type: string, status: string, splits: { userId: string, shareMinor: number }[] }[],
 *   settlements: { fromUserId: string, toUserId: string, amountMinor: number, status: string }[],
 *   memberIds: string[],
 * }} ledger
 * @returns {Record<string, number>}
 */
export function calculateMemberBalances({ expenses, settlements, memberIds }) {
  const net = Object.fromEntries(memberIds.map((id) => [id, 0]));
  const member = (id) => {
    if (!Object.hasOwn(net, id)) throw new LedgerError("UNKNOWN_MEMBER", `Not a household member: ${id}`);
    return id;
  };

  for (const e of expenses) {
    if (e.type === "personal" || !COUNTED_STATUS.has(e.status)) continue;
    const shareTotal = e.splits.reduce((sum, s) => sum + s.shareMinor, 0);
    if (!Number.isSafeInteger(e.amountMinor) || shareTotal !== e.amountMinor) {
      throw new LedgerError("SPLIT_MISMATCH", "Expense shares do not add up to its amount");
    }
    // A refund is stored with positive numbers like any expense, and counts the other way:
    // the payer got money back (paid less) and each person owes less (a smaller share).
    const sign = e.type === "refund" ? -1 : 1;
    net[member(e.paidBy)] += sign * e.amountMinor;
    for (const s of e.splits) net[member(s.userId)] -= sign * s.shareMinor;
  }

  for (const t of settlements) {
    if (t.fromUserId === t.toUserId) throw new LedgerError("SELF_SETTLEMENT", "Cannot repay yourself");
    if (!Number.isSafeInteger(t.amountMinor) || t.amountMinor <= 0) {
      throw new LedgerError("INVALID_AMOUNT", "Repayment must be a positive integer (paise)");
    }
    member(t.fromUserId);
    member(t.toUserId);
    if (t.status !== "confirmed") continue;
    net[t.fromUserId] += t.amountMinor;
    net[t.toUserId] -= t.amountMinor;
  }

  if (Object.values(net).reduce((sum, v) => sum + v, 0) !== 0) throw new LedgerError("LEDGER_NOT_BALANCED");
  return net;
}
