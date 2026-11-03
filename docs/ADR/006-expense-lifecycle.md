# ADR 006: Expense lifecycle: edit, reverse, refund, dispute

Status: accepted, 2026-11-03

## Context

People record expenses wrongly: a wrong amount, a duplicate, a returned item, a disagreement. The ledger is only trustworthy if corrections never erase history, never let two people overwrite each other, and always leave a record of who did what and why. Several design questions had more than one reasonable answer.

## Decision

1. **Reverse by status, not by a mirror row.** Reversing sets the expense to `reversed` and writes an audit event with the reason. The row and its splits stay. The ledger already skips reversed expenses, so balances are right immediately. Reversing again is a no-op that writes nothing new.
2. **A refund is a new expense of type `refund`, with positive amounts.** It links to the original through `refundOfId`, is paid by the original payer, and is shared back pro rata using the original shares. The ledger subtracts refunds instead of adding them. This keeps the database guard that amounts must be above zero. The refunds of one expense cannot add up to more than its amount.
3. **Only the person who recorded an expense can edit or reverse it.** Everyone else can dispute it. This stops anyone silently changing a number someone else entered.
4. **A dispute is a status plus an audit event.** Another member flags a confirmed expense with a reason (kept in the audit trail, no new columns). A disputed expense still counts in balances. The person who raised it can withdraw it. The person who recorded it resolves it by editing or reversing.
5. **Edit replaces the content and is guarded by a version.** The client sends the whole expense plus the version it last saw. A stale version returns `409 STALE_VERSION` with the current version. The payer and the date stay as they were if not sent; omitted notes and category are cleared. An edit also settles a dispute.
6. **Every change locks the row first.** Edit, reverse, dispute, withdraw and refund each start with `SELECT ... FOR UPDATE` on the expense, then decide. Two simultaneous requests line up one behind the other, so exactly one edit wins, two refunds cannot together exceed the original, and a refund cannot appear while the original is being edited or reversed. Refusals are returned as values and the transaction ends without changes.
7. **Linked records block each other.** An expense with active refunds cannot be edited or reversed (reverse the refunds first). A refund cannot be edited; reverse it and record a new one.
8. **History is the audit trail.** `GET .../history` returns an expense's audit events oldest first, with before and after snapshots. There is no route to change or delete them, and a database trigger refuses it anyway.
9. **Which actions need an idempotency key.** Creating an expense and creating a refund do (they add rows). Edit is guarded by the version, and reverse, dispute and withdraw are safe to repeat, so they do not.

## Why

- **Status over a mirror row:** one row to read, one flag for the ledger, and the history still shows who reversed what and why. A mirror row would double the rows and force the ledger to understand pairs.
- **Positive refunds:** weakening the amount guard to allow negatives would make every bad insert harder to catch.
- **Creator-only edits:** it is the simplest rule that prevents tampering, and disputes give everyone else a voice.
- **Locking before deciding:** the check and the write happen under one lock, so there is no gap for a second request to slip through.

## Consequences

- Adding the `refund` enum value is permanent in PostgreSQL without recreating the type.
- A client that edits must send the full body and the latest version, and must handle `409` by reloading.
- If the person who recorded an expense leaves, nobody else can edit or reverse it. Disputing and the household owner's future tools are the workaround; this can be revisited.
- The history endpoint returns at most 200 events with no paging.

## Alternatives considered

- **Mirror entry for reversals** (via `reversalOfId`): classic accounting style, but more rows and more ledger logic for the same result.
- **Loosening the database to allow negative refunds:** matches the first ledger sketch, but removes a guard.
- **Any member may edit:** easiest for two trusting roommates, but it lets anyone change another's entry.
- **Last write wins on edits:** simplest, but two simultaneous edits would silently lose one.
