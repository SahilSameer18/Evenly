# ADR 004: Idempotency keys for creating expenses

Status: accepted, 2026-11-03

## Context

On a phone, requests get repeated: a double tap, a dropped connection that the app retries, a user pressing Save again because nothing seemed to happen. Without protection, one rent payment becomes two, and both people's balances are silently wrong. The ledger also cannot tell a duplicate from a genuine second expense of the same amount.

## Decision

1. **The client sends an `Idempotency-Key` header** when it creates an expense. It makes the key when the form opens (a UUID works), so every retry of that form reuses it. The server requires it: 8 to 64 characters of letters, digits, `_` and `-`.
2. **The key is scoped to the user.** The database has a unique index on `(createdById, idempotencyKey)`, so two people can use the same key independently.
3. **The server stores a hash of the request** in `Expense.requestHash`: SHA-256 of the household id plus the cleaned request body, written as canonical JSON (keys sorted), so field order does not matter.
4. **A repeat of the same key is answered by comparing hashes:**
   - same hash: it is a retry. The server returns the stored expense with the original `201` and the header `Idempotent-Replayed: true`. Nothing new is written.
   - different hash: the key is being reused for something else. The server returns `422 IDEMPOTENCY_KEY_REUSED` and writes nothing.
5. **Simultaneous duplicates are settled by the unique index, not by application code.** If two identical requests arrive at once, both pass the "is this key used?" check, one insert wins, and the other fails with a unique-violation error. The loser then reads the winner's row and returns it as a replay. Exactly one expense exists.
6. **The household id is part of the hash**, so reusing a key in another household counts as a different request.

## Why

- **The database is the one place that can enforce "only one" atomically with the insert.** A check done in application code (or a cache) leaves a gap between checking and writing; the unique index closes it.
- **Storing a hash, not the whole response,** keeps rows small and lets the server tell an honest retry from a client bug that reuses a key.
- **Returning the original status plus a header** makes a replay indistinguishable from the first success for the client's logic, while still letting tests and monitoring see it.
- **No Redis.** The plan's MVP uses the database unique index; a cache would add a second system for no benefit at this scale.

## Consequences

- Clients must generate a key per form and send it on every create. The frontend will do this when the add-expense form opens.
- A replay returns the expense as it is stored now. Once expenses can be edited (Phase 2.2), a late retry returns the edited version, not the original bytes.
- Keys are kept forever for now. A cleanup of old keys can be added later; the unique index only needs the key while retries are plausible.
- The same mechanism will be reused for settlements (Phase 2.3), which will need the same `requestHash` column.
- Existing expenses (the seed) have no key or hash, which is fine because both columns are optional.

## Alternatives considered

- **Idempotency in Redis** (the blueprint's sample): faster, but a second system to run and keep consistent, and it still needs the database index as a backstop.
- **Deduplicating by content** (same amount, payer and time): rejects legitimate repeat purchases and misses retries whose time differs.
- **Storing the whole response body:** simpler replays, but larger rows and it freezes an out-of-date answer.
