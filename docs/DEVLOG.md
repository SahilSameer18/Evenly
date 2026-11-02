# Dev log

One entry per week: done, blocked, next.

## Week of 2026-11-02

- **Done:** planned the project (8-part plan, ledger rules, folder structure). Moved docs into `docs/`. Connected Prisma to Neon. Built the ledger core in `server/src/ledger/` (money parsing, split, balances, settlement suggestions, refunds) with 57 tests, including 10,000-run property tests. Chose a hash tie-break for leftover paise. Wrote the PRD and ADRs 001 and 002. Finished Phase 1.4: Prisma schema (9 models, enums, indexes) and init migration on Neon; a hand-written migration with CHECK constraints, a deferred split-sum trigger and an append-only audit trigger, tested with 12 rolled-back cases; a seed script (demo household, balances +300 / -300); a test-database helper; and a tenant-scoped expense repository with a test. 59 tests pass.
- **Blocked:** nothing. The test-database helper is untested until a separate Neon test branch exists.
- **Next:** Phase 1.5, authentication (register, login, refresh-token rotation with reuse detection, logout).
