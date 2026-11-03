# Evenly

Shared-expense tracker for roommates. Every balance is computed from recorded transactions and can be explained down to the individual expense.

> **Status:** early development, not deployed. The money engine, database and authentication are built and tested. Households, expenses, settlements and the app UI are next. See [the plan](docs/PLAN.md) and the [dev log](docs/DEVLOG.md).

## Principles

- **Ledger first, expense tracker second, AI third.** Deterministic code decides the money; AI (later) only drafts, and a human confirms.
- **Integer paise only.** No floats anywhere in money logic.
- **Balances are never stored.** They are recomputed from confirmed expenses and repayments, and always sum to zero.
- **Append-only history.** Corrections are reversals, never deletes.
- **The database defends the ledger.** CHECK constraints, a split-sum trigger and an append-only audit trigger refuse bad data even if application code regresses.

## What works today

| Area | State |
|---|---|
| Ledger core (`server/src/ledger`) | Money parsing, one largest-remainder split rule with a fair hash tie-break, balances, settlement suggestions, refunds. Property-tested over 10,000 random ledgers per property. |
| Database | Prisma schema (users, households, expenses, splits, settlements, audit events, refresh tokens), migrations including the hand-written guards, seed script. |
| Authentication | Register, login, 15-minute access tokens, rotating refresh-token cookie with reuse detection, logout, password change, rate limiting, CSRF guard. Details in [SECURITY.md](docs/SECURITY.md). |
| API plumbing | Request ids, structured logs, one response/error envelope, Zod validation on every input. |
| Households, expenses, settlements, UI | Not built yet. |

### API so far (`/api/v1`)

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/register` | Create an account |
| POST | `/auth/login` | Log in; returns an access token and sets the refresh cookie |
| POST | `/auth/refresh` | Rotate the refresh token (needs `X-Evenly-Client: web`) |
| POST | `/auth/logout` | End this device's session (needs `X-Evenly-Client: web`) |
| POST | `/auth/change-password` | Change password and sign out other devices |
| GET | `/users/me` | The current user |

`GET /health` and `GET /ready` are the liveness and database checks.

## Stack

| Layer | Choice |
|---|---|
| Client | React, Vite, Tailwind CSS (scaffold only so far) |
| Server | Node.js, Express 5 (JavaScript, ES modules), Zod |
| Database | PostgreSQL on Neon, via Prisma 7 |
| Auth | Argon2id, `jose` (JWT), opaque hashed refresh tokens |
| Logging | Pino |
| Tests | Vitest, fast-check, Supertest (Playwright planned) |

## Repository layout

```
client/   React PWA
server/   Express API; server/src/ledger is the pure money engine
docs/     PRD, plan, ledger rules, security, ADRs, dev log
```

## Docs

- [PRD](docs/PRD.md): problem, users, MVP scope, non-goals
- [Plan](docs/PLAN.md): phased roadmap
- [Ledger](docs/LEDGER.md): formulas, algorithms, invariants
- [Security](docs/SECURITY.md): what is enforced, known limits
- [Folder structure](docs/FOLDER.md): layout, built and planned
- [Decisions (ADRs)](docs/ADR): money representation, database, cookie sessions
- [Dev log](docs/DEVLOG.md): weekly progress

## Setup

Developed on Node 24. You also need a free [Neon](https://neon.tech) project.

```bash
cd server
npm install
cp .env.example .env
```

Fill in `server/.env`:

| Variable | What |
|---|---|
| `DATABASE_URL` | Neon pooled connection string (used by the app) |
| `DIRECT_URL` | Neon direct connection string (used by migrations) |
| `JWT_ACCESS_SECRET` | 32+ random characters. Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `CLIENT_ORIGIN` | Optional, defaults to `http://localhost:5173` |
| `TEST_DATABASE_URL` | Pooled string of a **separate** Neon branch, for tests only |

Create the tables and generate the Prisma client, then start the API:

```bash
npx prisma migrate deploy
npx prisma generate
npm run seed        # optional: a demo household
npm run dev
```

Run `npx prisma generate` again after any schema change or `npm install`, or the client will not know about new tables.

The client is a scaffold: `cd client && npm install && npm run dev`.

## Tests

```bash
cd server
npm test
```

Most tests need no database. The `*.db.test.js` tests run against `TEST_DATABASE_URL`, are skipped without it, and wipe every table in that database, so it must be a separate Neon branch. Create the branch as a **schema-only** copy of your dev branch, then mark its migrations as applied:

```bash
npx prisma migrate resolve --applied <migration-name>   # once per migration, with DIRECT_URL pointing at the test branch
```

Or point `DIRECT_URL` at the empty test branch and run `npx prisma migrate deploy`.
