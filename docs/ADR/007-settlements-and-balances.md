# ADR 007: Settlements and balances

Status: accepted, 2026-11-04

## Context

Roommates pay each other back outside the app (cash, UPI, a bank transfer). The app cannot see that money move, so a repayment is a claim until the other person agrees it arrived. Balances must stay explainable: any number shown has to be re-derivable from the stored records.

## Decision

1. **A repayment starts `pending` and counts for nothing until the recipient confirms it.** The sender records it; only the recipient can confirm or reject it, so nobody can credit themselves with money they did not receive. The sender can cancel while it is pending. Confirmed, rejected and cancelled are final.
2. **Repeating the same move is a no-op; any other move on a finished repayment is `409 SETTLEMENT_NOT_PENDING`.** Confirming twice returns the same result with one audit event. Confirm racing cancel is decided by a row lock (`SELECT ... FOR UPDATE`): exactly one wins.
3. **No editing a pending repayment.** The sender cancels it and records a new one. This keeps the history honest and the rules short.
4. **Any amount is allowed.** Paying more than is owed flips the direction of the balance; the recipient still has to confirm. We do not guess what the sender "meant".
5. **Balances are never stored.** `GET /balances`, `GET /ledger` and `GET /settlement-suggestions` load the household's records and ask the pure ledger. A new function, `explainLedger`, returns each member's formula parts (paid, share, sent, received, net) and a chronological list of entries with every member's running balance after each one. It calls `calculateMemberBalances` first, so validation is shared and the last running balance always equals the net.
6. **Everyone sees everyone's repayments and balances**, but never another person's personal expenses.
7. **A pending repayment blocks leaving** the household (`409 HAS_PENDING_REPAYMENTS`) for both sender and recipient, until it is confirmed, rejected or cancelled. The balance rule for leaving is unchanged.
8. **A runtime check after money-changing writes.** After an expense is created, edited, reversed or refunded, or a repayment is confirmed, the books are recomputed. If the ledger throws (a split that does not add up, an unknown member, a sum that is not zero) an error is logged with the request id and code. The check never fails the request, because the write has already been committed. Creating an expense, creating a refund and confirming a repayment also return `balanceAfter` (every member's new net, or `null` if the check could not run).
9. **Retries.** Creating a repayment needs an `Idempotency-Key`, handled exactly like expenses (ADR 004): the same key and request returns the stored one, a different request is `422`, two at once make one row.

## Why

- **Confirmation by the recipient:** it is the only party who can know the money arrived.
- **No stored balances:** a stored number can drift from the records. A computed one can always be proved.
- **Logging instead of failing:** a failed check after a committed write cannot be undone, so the useful thing is to make it loud for someone to investigate.

## Consequences

- Every balance call and every check loads the household's whole ledger. Fine at household size; revisit if ledgers grow large.
- Pending repayments never expire. Blocking leave is the pressure to settle them.
- Dispute and withdraw do not run the check (they change a flag, not a number).
- If the recipient has left, nobody can confirm; the sender cancels. Leaving is blocked while a repayment is pending, so this only arises through data repair.

## Alternatives considered

- **Sender confirms their own payment:** simplest, but lets anyone claim a payment that never happened.
- **Editable pending repayments:** friendlier, but needs versioning and conflict handling for little gain.
- **Capping a repayment at the amount owed:** blocks a legitimate "I paid a bit extra" and still needs the flip logic for races.
- **Failing the request when the check fails:** the write would already be committed, so the client would be told "error" about something that happened.
