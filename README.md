# Evenly

Shared-expense tracker for roommates. Every balance is computed from recorded transactions and can be explained down to the individual expense.

> **Status:** early development. Planning is done; the ledger core is the next thing being built. Nothing is deployed yet.

## Principles

- **Ledger first, expense tracker second, AI third.** Deterministic code decides the money; AI (later) only drafts, and a human confirms.
- **Integer paise only.** No floats anywhere in money logic.
- **Balances are never stored.** They are recomputed from confirmed expenses and repayments, and always sum to zero.
- **Append-only history.** Corrections are reversals, never deletes.

## Stack

| Layer | Choice |
|---|---|
| Client | React, Vite, Tailwind CSS |
| Server | Node.js, Express (JavaScript, ES modules), Zod |
| Database | PostgreSQL on Neon, via Prisma |
| Tests | Vitest, fast-check, Supertest, Playwright |

## Repository layout

```
client/   React PWA
server/   Express API; server/src/ledger is the pure money engine
docs/     PLAN.md, LEDGER.md, FOLDER.md (target structure), reference/
```

## Docs

- [Plan](docs/PLAN.md): phased roadmap
- [Ledger](docs/LEDGER.md): formulas, algorithms, invariants
- [Folder structure](docs/FOLDER.md): target layout

## Setup

```bash
cd server && cp .env.example .env   # fill in your Neon URLs
npm install
cd ../client && npm install && npm run dev
```
