import { LedgerError, calculateMemberBalances, explainLedger, suggestSettlements } from "../../ledger/index.js";
import * as repository from "./balance.repository.js";

// Database rows -> what the ledger functions take. `at` orders the entries and `label` is for people to read.
export function toLedgerInput({ expenses, settlements, members }) {
  return {
    memberIds: members.map((m) => m.userId),
    expenses: expenses.map((e) => ({
      id: e.id,
      at: e.occurredAt,
      label: e.description,
      paidBy: e.paidById,
      amountMinor: e.amountMinor,
      type: e.type,
      status: e.status,
      splits: e.splits.map((s) => ({ userId: s.userId, shareMinor: s.shareMinor })),
    })),
    settlements: settlements.map((t) => ({
      id: t.id,
      at: t.status === "confirmed" ? (t.confirmedAt ?? t.initiatedAt) : t.initiatedAt,
      label: `Repayment (${t.method})`,
      fromUserId: t.fromUserId,
      toUserId: t.toUserId,
      amountMinor: t.amountMinor,
      status: t.status,
    })),
  };
}

/** The rows, plus the same rows shaped for the ledger. Balances are always worked out from this, never stored. */
export async function loadState(householdId) {
  const rows = await repository.loadLedger(householdId);
  return { ...rows, input: toLedgerInput(rows) };
}

export const netOf = (state) => calculateMemberBalances(state.input);

const whoIs = (state) => new Map(state.members.map((m) => [m.userId, { userId: m.userId, name: m.user.name, active: m.status === "active" }]));

export async function getBalances(membership) {
  const state = await loadState(membership.householdId);
  const { members } = explainLedger(state.input);
  const people = whoIs(state);
  const rows = [...people.values()]
    .map((p) => ({ ...p, ...members[p.userId] }))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  return { members: rows, settledUp: rows.every((r) => r.netMinor === 0) };
}

export async function getLedger(membership) {
  const state = await loadState(membership.householdId);
  const { entries } = explainLedger(state.input);
  return { members: [...whoIs(state).values()], entries };
}

export async function getSuggestions(membership) {
  const state = await loadState(membership.householdId);
  const people = whoIs(state);
  const suggestions = suggestSettlements(netOf(state)).map((s) => ({
    from: people.get(s.from),
    to: people.get(s.to),
    amountMinor: s.amountMinor,
  }));
  return { suggestions };
}

/**
 * The runtime check: do the books still add up? Exported on its own so it can be tested with a broken ledger.
 * The ledger throws if a split does not add up, a member is unknown, or the balances do not sum to zero.
 */
export function checkBalances(input, { log, requestId, householdId }) {
  try {
    return calculateMemberBalances(input);
  } catch (err) {
    if (!(err instanceof LedgerError)) throw err;
    log.error({ requestId, householdId, code: err.code }, "balances do not reconcile");
    return null;
  }
}

/**
 * Call after a write that changes money. Returns the balances now, or null if they could not be worked out.
 * It never throws: the write is already committed, so a failure here is logged for someone to investigate
 * and must not turn a successful request into an error.
 */
export async function reconcile({ householdId, log, requestId }) {
  try {
    const state = await loadState(householdId);
    return checkBalances(state.input, { log, requestId, householdId });
  } catch (err) {
    log.error({ requestId, householdId, err: err.message }, "balance check could not run");
    return null;
  }
}
