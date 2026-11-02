import { LedgerError } from "./errors.js";

/**
 * Greedy plan: the biggest debtor pays the biggest creditor. Suggestions only, never stored or applied.
 * Not always the minimum number of transfers for large groups; fine for 2-4 people.
 * @param {Record<string, number>} net balances from calculateMemberBalances
 * @returns {{ from: string, to: string, amountMinor: number }[]}
 */
export function suggestSettlements(net) {
  if (Object.values(net).reduce((sum, v) => sum + v, 0) !== 0) throw new LedgerError("LEDGER_NOT_BALANCED");

  const creditors = [];
  const debtors = [];
  for (const [id, v] of Object.entries(net)) {
    if (v > 0) creditors.push({ id, amt: v });
    else if (v < 0) debtors.push({ id, amt: -v });
  }
  const order = (a, b) => b.amt - a.amt || a.id.localeCompare(b.id);
  creditors.sort(order);
  debtors.sort(order);

  const plan = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amt, creditors[j].amt);
    plan.push({ from: debtors[i].id, to: creditors[j].id, amountMinor: pay });
    debtors[i].amt -= pay;
    creditors[j].amt -= pay;
    if (debtors[i].amt === 0) i++;
    if (creditors[j].amt === 0) j++;
  }
  return plan;
}
