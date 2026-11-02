# Dev log

One entry per week: done, blocked, next.

## Week of 2026-11-02

- **Done:** planned the project (8-part plan, ledger rules, folder structure). Moved docs into `docs/`. Connected Prisma to Neon. Built the ledger core in `server/src/ledger/` (money parsing, split, balances, settlement suggestions, refunds) with 57 tests, including 10,000-run property tests. Chose a hash tie-break for leftover paise. Wrote the PRD and ADRs 001 and 002.
- **Blocked:** nothing.
- **Next:** database schema (User, Household, HouseholdMember, Expense, ExpenseSplit, Settlement), then CHECK constraints and the split-sum trigger.
