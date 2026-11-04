Evenly: Detailed 8-Part Plan (working title)
Core rule: AI interprets and suggests; deterministic code decides the money. Order of importance: ledger first, expense tracker second, AI third.

0. Stack (confirmed)
Layer	Choice
Frontend	React + JavaScript (.jsx) + Vite + Tailwind, TanStack Query, react-hook-form + Zod
Backend	Node.js + Express in JavaScript (ES modules), Zod validation
Ledger core	server/src/ledger/ in plain JavaScript with JSDoc types, checked by tsc --checkJs --noEmit in CI: pure functions, no I/O, no imports from Prisma, Express or anything outside the folder (enforced by an ESLint no-restricted-imports rule)
Database	PostgreSQL on Neon, via Prisma
Tests	Vitest, fast-check (property tests), Supertest, Playwright
Hosting	Vercel (frontend), Render or Railway (backend), Sentry (errors)
Repo	Flat layout, two separate apps: client/, server/ (each with its own package.json), plus docs/ and e2e/
Neon notes: Prisma needs two URLs: DATABASE_URL (pooled, for the running app) and DIRECT_URL (for migrations; set as directUrl in the Prisma datasource). The free tier suspends idle databases, so the first request can be slow. Use Neon branches for staging and for test databases. Check current free-tier limits in Phase 0. Money rules: integer paise only, never floats; percentages in basis points (1% = 100 bps); Int columns are enough (max about 21 million rupees per amount).

1. Overview
Part	Goal	Phases	Weeks (12-16 h/week)	Detail
0	Setup	1	before week 1	Full
1	The engine: ledger core, database, auth, households	6	1-4	Full
2	The app + LAUNCH (MVP)	6	5-10	Full
3	PWA and polish	5	11-12	Full
4	AI (2-3 features)	6	13-15	Full
5	Budgets and analytics	4	later	Outline
6	Recurring bills, notifications, jobs	4	later	Outline
7	Hardening and operations	4	later	Outline
8	Extras and growth	4	later	Outline
MVP = Parts 1 + 2. Launch at the end of Part 2, then use it for real for two weeks before Part 3. Plan Parts 5-8 properly only after launch.

Progress (updated 2026-11-03)
Phase	State	Notes
0	Done enough	Repo, Neon (dev branch and a separate schema-only test branch), PRD, ADRs.
1.1	Partly done	Repo, Express skeleton, Zod env, Vitest, client scaffold are done. ESLint/Prettier, the lint-staged hook, the ledger import rule, the tsc typecheck and GitHub Actions CI were skipped by choice.
1.2	Done	One split rule with a hash tie-break (see ADR 001), not a userId tie-break.
1.3	Done except two items	All vectors and the 10,000-run property tests pass. Not done: JSDoc typedefs (1.3.1), the 100% branch-coverage gate and the ledger-v0.1 tag (1.3.9).
1.4	Done	Schema, CHECK and trigger guards, seed, test-database helper, tenant-scoped repository (checked by a test instead of a lint rule).
1.5	Done	All 14 sub-phases, SECURITY.md v1, ADR 005. Rate limits are in memory.
1.6	Done	Households, membership middleware with the 404 rule, owner-only settings, single-use invitations, leave with balance check and ownership transfer, authorization suite, end-to-end gate test, SECURITY.md tenancy section, ADR 003.
Part 1 gate	Met, with three gaps	Two real users sign up, share a household and a third gets 404 on everything (tested end to end against a real database). Gaps: the ledger is not tagged ledger-v0.1, there is no CI (by choice), and branch coverage is not measured.
2.1	Done	Expense create and read API: four split methods, personal and on-behalf types, idempotency keys, one-transaction writes with an audit event, filters and cursor pagination, private personal expenses (ADR 004).
2.2	Done	Edit with optimistic locking, reverse, refund (new refund type, positive amounts), dispute, history; every change locks the row and writes an audit event (ADR 006).
2.3	Done	Repayments (pending until the recipient confirms; reject, cancel), balances, ledger with running balances, settlement suggestions, balanceAfter, runtime reconciliation, leave blocked by pending repayments (ADR 007). The blueprint's worked example (+300 / -300) reproduces through the API.
2.4 onward	Not started	Next: the frontend (2.4 and 2.5), then deploy (2.6).

Where the build differs from this plan
- 2.3: refund responses also carry balanceAfter; dispute and withdraw skip the reconciliation check (they change no number); pending repayments cannot be edited, only cancelled; any amount is allowed; a pending repayment blocks leaving.
- Leftover paise are given by a hash of the expense id and user id, not by userId order (ADR 001).
- Tests live in `__tests__/` folders next to the code they test, not beside each file.
- Folders are `middlewares/`, `lib/` and `utils/`, not `middleware/` and `shared/` (see FOLDER.md).
- The React Compiler is enabled in the client.
- There is no CI and no ESLint or JSDoc type check yet; tests run locally against a separate Neon test branch, one test file at a time, behind a run lock so two runs cannot collide. The full suite takes about 7 minutes because every query to the remote database costs about 80 ms.
- Decisions made in 1.6: only the owner invites, invitations can be locked to one email, and an owner must transfer ownership before leaving.

2. How to work (applies to every phase)
One phase = one Git branch = one pull request (even if you merge it yourself). Merge only when CI is green.
Sub-phase size: about 1-3 hours, one clear outcome. If one grows past a half-day, split it.
Definition of done for a sub-phase: code written, test written (anything with a branch, loop, parser or money), lint and types pass, committed with a clear message.
Definition of done for a phase: its "Done when" line is true, README or docs updated, branch merged, a short demo (GIF or screenshot) saved for the portfolio.
Weekly rhythm: plan the week on Monday (pick sub-phases), demo to yourself on Sunday, write 3 lines in docs/DEVLOG.md (done, blocked, next).
Order inside Part 1: ledger tests come before any database or HTTP code. Do not skip ahead.
Never cut: property tests, the authorization suite, idempotency, the audit trail.
PHASE 0: Setup (1-2 days, before week 1)
0.1 Name and repo. Choose the project name; check GitHub, npm scope and a domain. Create the GitHub repo with a README stub, MIT or private license choice, .gitignore for Node and env files.
0.2 Tools. Install Node LTS, pnpm, Git, VS Code (ESLint, Prettier, Prisma extensions). Docker is optional (local Postgres).
0.3 Accounts (free tiers). GitHub, Neon, Vercel, Render or Railway, Sentry. Enable 2FA on all of them.
0.4 Neon. Create the project and a dev branch. Copy the pooled and direct connection strings into a local, uncommitted .env. Run psql or a Prisma connection test to confirm it connects.
0.5 Gemini key. Get an API key for Part 4; store it in .env only. Read the current quotas and data-handling terms for the model you plan to use, and write down what you must not send.
0.6 PRD. Write docs/PRD.md: the problem, the two users, MVP scope (Parts 1-2), non-goals (no bank connections, no multi-currency), success metrics.
0.7 Plan in repo. Copy this plan to docs/PLAN.md. Create docs/DEVLOG.md and docs/ADR/ folders.
0.8 Schedule. Book your weekly hours in the calendar; set a target date for the end of Part 1 and Part 2; list the people who will test (your roommate). Done when: empty repo on GitHub, Neon reachable from your machine, secrets in .env (and not in Git), PRD written, hours scheduled.
PART 1: THE ENGINE (weeks 1-4)
Goal: a tested money engine, a real database, working login, and households that cannot see each other.

Phase 1.1 Repo and tooling (about 1 day)
1.1.1 Create the repo with client/, server/, docs/, e2e/; each app has its own package.json and scripts (lint, test, build). No workspace file; use npm or pnpm, whichever you use in your other projects.
1.1.2 server/src/ledger/: JSDoc-typed JavaScript, a jsconfig.json/tsconfig.json with checkJs and strict, npm run typecheck runs tsc --noEmit; export a trivial function.
1.1.3 server: Express app skeleton in JavaScript (ES modules), app.js separate from server.js so tests can import the app without listening.
1.1.4 client: Vite + React (JavaScript template, no TypeScript, React Compiler enabled) + Tailwind scaffold that renders a placeholder page.
1.1.5 ESLint + Prettier in both apps; add the no-restricted-imports rule so files in server/src/ledger/ cannot import Prisma, Express, fs, or anything outside the folder; pre-commit hook for lint-staged.
1.1.6 Vitest in server (it covers ledger/ too); one passing test for the trivial ledger function and one for the app.
1.1.7 GitHub Actions CI: for each app, install, lint, typecheck, test, build on every push and pull request; a Postgres service container ready for later.
1.1.8 Zod-validated environment config in server/src/config/env.js that fails fast with a readable message; .env.example committed. Done when: a pushed commit goes green in CI and npm test (or pnpm test) passes locally in both server/ and client/.
Phase 1.2 Money and splits (about 4-5 days)
1.2.1 Write the rules down first: docs/LEDGER.md with the net-balance formula (Net = Paid - Share + Sent - Received) and invariants I1-I7.
1.2.2 toMinor("1,250.5") to paise with no floats; reject negatives, 3+ decimals, empty and junk input. Tests include 0.1, 1,000, .50, 1e3.
1.2.3 formatMoney(minor) for display only (en-IN grouping, paise). Mark it display-only; never used in calculations.
1.2.4 splitEqual(total, userIds): sorted IDs, floor division, leftover paise by order. Test vectors 1 and 2.
1.2.5 splitByBasisPoints(total, parts): reject bps sum not 10000; largest-remainder with deterministic tie-break. Test vector 3.
1.2.6 splitExact(total, shares): reject if sum is not total (SPLIT_MISMATCH), reject negatives. Test vector 13.
1.2.7 splitByWeights(total, weights) (2:1:1 style) using the same remainder rule; reject zero or negative weights.
1.2.8 Property tests (fast-check, 10,000 runs): every split sums to the total; equal-split shares differ by at most 1 paisa; results are identical regardless of input order. Done when: vectors 1, 2, 3, 13 pass, property tests pass, 100% branch coverage on the split files.
Phase 1.3 Balances, settlements, reversals (about 5-6 days)
1.3.1 Define the JSDoc @typedefs: Expense, Split, Settlement, Net (no dependency on Prisma or Express).
1.3.2 calculateMemberBalances: confirmed shared expenses and confirmed settlements only; throws LEDGER_NOT_BALANCED if the sum is not zero. Vectors 4 and 5.
1.3.3 Settlement status handling: pending and rejected change nothing; confirmed applies. Vectors 6 and 7.
1.3.4 Overpayment flips direction; self-settlement and non-member settlement rejected. Vectors 8 and 14.
1.3.5 suggestSettlements(net): greedy matching with deterministic ordering; returns suggestions only. Vectors 9 and 12.
1.3.6 Reversals: a reversed expense is excluded; the result equals the ledger without it. Vector 11.
1.3.7 Refunds: allocate a refund across the original beneficiaries pro rata with the same remainder rule. Vector 10.
1.3.8 Property tests: random ledgers always sum to zero; applying the suggested plan clears every balance; personal expenses never change balances; pending settlements never change balances.
1.3.9 Coverage gate (100% branches on server/src/ledger/) in CI; generate the test report; tag ledger-v0.1. Done when: all 14 test vectors pass, properties pass with 10,000 runs in CI, you can explain every invariant in docs/LEDGER.md out loud.
Phase 1.4 Database on Neon with Prisma (about 4 days)
1.4.1 Prisma setup in server/; datasource with url (pooled) and directUrl; confirm prisma migrate dev works against the Neon dev branch.
1.4.2 Schema, part A: User, Household, HouseholdMember (role, status, joinedAt, leftAt, unique on household + user), Invitation (token hash, expiry, usedAt).
1.4.3 Schema, part B: Expense (amountMinor, paidBy, type, status, version, occurredAt, reversalOf, idempotencyKey), ExpenseSplit, Settlement, Category, AuditEvent.
1.4.4 Raw-SQL migration for CHECK constraints: amount > 0, share >= 0, from <> to, valid status values.
1.4.5 Raw-SQL migration for a deferred constraint trigger: the sum of an expense's splits equals its amount (Prisma does not manage triggers, so keep them in a migration file and document it).
1.4.6 Indexes from real query patterns: (householdId, occurredAt desc), unique (userId, idempotencyKey), membership lookup, pending settlements.
1.4.7 Repository layer: every function takes householdId as a required parameter; add a lint rule or test that no repository call omits it.
1.4.8 Seed script (demo household with two users and sample expenses) and a test-database helper (reset between tests; Postgres service container in CI). Done when: prisma migrate deploy works on a fresh database, inserting splits that do not sum to the amount fails at commit, the seed loads, CI runs DB tests.
Phase 1.5 Authentication (about 4-5 days)
1.5.1 Middleware stack: request ID, structured logger (pino), JSON body limit, helmet, strict CORS allow-list, central error handler with stable error codes and no stack traces in production.
1.5.2 Response envelope (data + meta.requestId, or error + meta) and a Zod validation middleware for body, params and query using .strict().
1.5.3 Register: email normalised and unique, Argon2id hash, Zod rules; login with a generic failure message.
1.5.4 Access token (short-lived) and refresh token in an HTTP-only, Secure, SameSite=Lax cookie scoped to the auth path.
1.5.5 Refresh rotation with reuse detection: store refresh token hashes in a table with a family ID; presenting an already-used token revokes the family.
1.5.6 Logout, GET /users/me, password change that revokes all sessions.
1.5.7 Rate limiting on login, register and refresh (in-memory express-rate-limit for now).
1.5.8 Tests: register and login happy paths, wrong password, duplicate email, expired token, refresh reuse revokes the family, cookie flags. Done when: you can register, log in, refresh, and log out through HTTP tests, and a reused refresh token is rejected.
Phase 1.6 Households and tenancy (about 4 days)
1.6.1 POST /households (creator becomes owner and member), GET /households (my memberships), GET /households/:id.
1.6.2 Membership middleware: loads the caller's active membership for :id; attaches it to the request; non-members and unknown IDs both return 404.
1.6.3 Invitations: create (single-use token, 7-day expiry, store only the hash, optionally bound to an email); the accept endpoint takes the token in the request body, not the URL.
1.6.4 Accept invitation: validates token, expiry, not used; creates membership in one transaction; marks the invitation used.
1.6.5 Household settings: currency (INR only for now), timezone, default split method; owner-only changes.
1.6.6 Leave household: blocked while the balance is not zero; sets status to left with leftAt; ownership transfer rule.
1.6.7 Authorization test suite: user B cannot read, list or modify household A; an expired, reused, or wrong invitation fails; a left member loses access.
1.6.8 Write docs/SECURITY.md v1 (what is enforced and where) and ADR 003 (tenancy by householdId and 404 rule). Done when: two real users share one household, a third user gets 404 on everything, the authorization suite is green in CI.
PART 1 GATE: ledger core is tagged and fully tested; two accounts can sign in and share a household; CI is green. If this took more than 6 weeks, cut Part 3 scope before continuing.

PART 2: THE APP, THEN LAUNCH (weeks 5-10)
Goal: two people can log expenses and settle up on their phones, safely, on a live URL.

Phase 2.1 Expense create and read API (about 5 days)
2.1.1 Zod schemas: description, amountMinor (positive int, capped), payer, type (shared | personal | on_behalf), split config (equal / exact / percentage / weights), category, occurredAt (future-date check evaluated per request, not when the module loads).
2.1.2 Service: verify payer and every beneficiary are active members of the household; run the ledger/ split; assert the sum equals the amount.
2.1.3 Create in one Prisma transaction: expense + splits + audit event (expense.created, with snapshot and requestId).
2.1.4 Idempotency: required Idempotency-Key header; a unique index on (userId, idempotencyKey); same key + same payload returns the stored result; same key + different payload returns 422.
2.1.5 Type rules: personal expenses are visible only to their owner and never counted in household balances; on-behalf maps to a 100% share for the other person.
2.1.6 GET /expenses with filters (from, to, category, payer, type, status, text), cursor pagination, stable sort; personal expenses of others are never returned.
2.1.7 GET /expenses/:eid with splits; foreign or personal-of-others IDs return 404.
2.1.8 Tests: each split method, mismatch rejected, duplicate request creates one record, transaction rolls back on failure, personal visibility. Done when: the full create/list/detail flow works over HTTP for two users, and a double-submitted request creates exactly one expense.
Phase 2.2 Expense lifecycle: edit, reverse, dispute (about 5 days)
2.2.1 Status model: confirmed (default, instant), disputed, reversed; documented transitions in docs/LEDGER.md.
2.2.2 Edit with optimistic locking: PATCH requires the current version; a conditional update; stale version returns 409 with the current version.
2.2.3 Edit recomputes splits and writes an audit event with before and after snapshots; refuse edits on reversed expenses.
2.2.4 Reverse: creates a mirror/exclusion record, never deletes; the balance equals the ledger without the expense; audit event with reason.
2.2.5 Refund flow: partial refund allocated pro rata across original beneficiaries using ledger/.
2.2.6 Dispute: the other member flags with a reason; still counted by default; a household setting can choose excluded-until-resolved later.
2.2.7 GET /expenses/:eid/history (audit events) readable by members; no endpoint can edit or delete audit events.
2.2.8 Tests: concurrent edits (two at once, exactly one wins), edit-after-repayment still balances, reverse twice is safe, audit trail complete. Done when: every financial change leaves an audit event, and the concurrency test passes repeatedly.
Phase 2.3 Settlements and balances API (about 4-5 days)
2.3.1 Record repayment (pending): amount, method (cash, UPI, bank, other), optional reference, note; both parties must be active members and different people; idempotency key required.
2.3.2 Confirm and reject: only the recipient may act; conditional transition pending -> confirmed/rejected; double confirm returns the same result; sender can cancel while pending.
2.3.3 GET /balances: computed by ledger/ from stored records (never stored, never client-supplied) with a per-transaction explanation.
2.3.4 GET /ledger: chronological expenses, settlements, reversals with running balance.
2.3.5 GET /settlement-suggestions: calls suggestSettlements; returns suggestions only; nothing stored.
2.3.6 Include balanceAfter in create-expense and confirm-settlement responses.
2.3.7 Tests: the worked example from the blueprint end to end over HTTP; partial repayment; overpayment flips direction; non-recipient confirm returns 403; pending does not change balance.
2.3.8 Add a runtime reconciliation check: after each financial write, recompute balances and log an error with the request ID if the sum is not zero. Done when: the blueprint's worked example (+300 / -300) reproduces through the API with the same numbers.
Phase 2.4 Frontend foundation and core screens (about 8 days)
2.4.1 App shell: router, layout, bottom navigation (Overview, Expenses, Settle) plus a floating Add button; desktop sidebar variant; Tailwind design tokens from the blueprint (navy, emerald, caution/danger colours).
2.4.2 API client: typed fetch wrapper, error envelope handling, request ID shown on errors, TanStack Query setup, 401 triggers refresh once then redirects to login.
2.4.3 Auth screens: register, login, logout, invitation accept page.
2.4.4 Household screens: create, invite (copy single-use link), member list; household switcher kept simple (one household in MVP).
2.4.5 Overview: total spending, your paid, your share, net balance with a plain-language line ("Roommate owes you X"), recent items.
2.4.6 Add-expense bottom sheet: numeric keypad (inputMode=decimal), description, payer, shared/personal toggle, split editor with a live per-person preview, review step; toMinor for parsing; idempotency key generated when the form opens.
2.4.7 Expenses list (infinite scroll, filters, search) and detail screen with the split breakdown.
2.4.8 Empty, loading (skeleton) and error states for every screen; undo toast after save. Done when: you can sign up, create a household, add a shared expense, and see it on a phone-sized screen.
Phase 2.5 Settle flow UI and MVP test suite (about 5 days)
2.5.1 Settle screen: who owes whom, the amount, and a "how is this calculated" breakdown linking to transactions.
2.5.2 Record repayment sheet; pending confirmations list; one-tap confirm/reject for the recipient.
2.5.3 Expense actions in the UI: edit, reverse (with reason), dispute; conflict (409) shown as a "this was changed, reload" prompt.
2.5.4 Settings screen: household name, default split, sessions (log out), member list.
2.5.5 Basic web manifest and icons so the app can be added to a home screen (full PWA is Part 3).
2.5.6 Complete the integration tests: every endpoint has happy path, authorization and validation cases; run in CI against Postgres.
2.5.7 Playwright two-user journey on a mobile viewport: register two users, invite, add shared and personal expenses, check both balances, partial repayment, confirm, reverse an expense; negative case: a user from another household opens the URL and gets 404.
2.5.8 Accessibility quick pass: tap targets >= 44 px, labels on inputs, contrast, not colour-only for positive/negative. Done when: the Playwright journey is green in CI and every endpoint appears in the test report.
Phase 2.6 Deploy and launch (about 5 days + 2 weeks of use)
2.6.1 Staging and production environments with separate Neon branches/databases, secrets and CORS origins; env validated at startup.
2.6.2 Deploy the backend (Render or Railway) with /health and /ready (database reachable); run prisma migrate deploy as a release step.
2.6.3 Deploy the frontend (Vercel); set up same-site domains (app. and api.) so cookies work; test login and refresh on a real iPhone and Android phone.
2.6.4 Observability: Sentry on client and server, structured logs with request ID, an uptime ping on /health.
2.6.5 Backups: enable Neon's point-in-time/backup features as available; do one restore drill into a scratch branch and write the steps in docs/RUNBOOK.md.
2.6.6 Seed a public demo household with fake data; record a 3-minute demo (create household, quick add, switch account, partial repayment, confirm, audit trail, test report).
2.6.7 README: pitch, architecture diagram, ledger invariants, test report screenshots, setup instructions, live demo link; ADRs for money, database, tenancy, idempotency, cookies.
2.6.8 LAUNCH. Move your real expenses in (opening balance as a dated adjustment if needed). Use it with your roommate for two weeks; keep a running list of annoyances and any number that looks wrong. Done when: the live URL works on both phones, a restore drill is done, and two real people have used it for two weeks with zero reconciliation errors.
PART 2 GATE (MVP): live, used daily by two people, property tests in CI, authorization suite green, README with demo. Update your resume bullets with real numbers.

PART 3: PWA AND POLISH (weeks 11-12)
Phase 3.1 Installable PWA (about 2 days)
3.1.1 Add vite-plugin-pwa with a full manifest (name, icons 192/512/maskable, theme and background colours, standalone display).
3.1.2 Precache the app shell; exclude /api from navigation fallback.
3.1.3 Install prompt UX: show "Add to home screen" guidance on iOS Safari (manual) and use the install event on Android.
3.1.4 registerType: prompt update flow: "New version available, reload" toast that never interrupts a form being edited.
3.1.5 Safe-area padding and viewport-fit=cover; splash and status bar colours.
3.1.6 Verify installs on a real Android and a real iPhone; fix cookie and scope issues found. Done when: both phones install the app and launch it full-screen.
Phase 3.2 Offline behaviour (about 2 days)
3.2.1 API requests use NetworkOnly (never serve a cached balance as current).
3.2.2 Offline banner: "You are offline, data may be outdated"; detect via navigator.onLine plus failed requests.
3.2.3 Disable add, confirm and settle actions while offline with a clear reason.
3.2.4 Network error and retry states with TanStack Query retry rules; idempotency keys keep retries safe.
3.2.5 Optional: queue add-expense offline in IndexedDB with an idempotency key, sync on reconnect (skip if time is short; note it in the cut list).
3.2.6 Test offline in the browser devtools and on a phone in aeroplane mode. Done when: offline never shows a fresh-looking balance, and retrying after a network blip creates no duplicates.
Phase 3.3 Reports, exports, UPI (about 3 days)
3.3.1 Monthly report endpoint: totals, paid vs share per member, net balance, top categories, change from last month (household timezone boundaries).
3.3.2 Monthly report screen with a shareable text summary (WhatsApp-friendly).
3.3.3 CSV export of expenses and settlements (with a signed or authenticated download).
3.3.4 UPI deep link on the Settle screen (upi://pay?pa=...&am=...&cu=INR) prefilled; the recipient still confirms in the app.
3.3.5 "Close the month" (optional): both members confirm to snapshot a period; skip if time is short.
3.3.6 Tests: timezone edge case (00:10 IST on 1 November is 18:40 UTC on 31 October, but belongs to November), CSV escaping. Done when: you can send your roommate the month's summary and a prefilled UPI payment link.
Phase 3.4 Look, feel, accessibility (about 3 days)
3.4.1 Dark mode following system setting with a manual override.
3.4.2 Tabular numerals for money, consistent spacing, loading skeletons everywhere.
3.4.3 Accessibility audit: keyboard navigation on desktop, focus order, screen-reader labels, reduced motion.
3.4.4 Run Lighthouse on a mid-range phone profile; target PWA pass and performance 90+; fix the top issues (route-based code splitting, image sizes).
3.4.5 Copy review: error messages, empty states, confirmation text. Done when: Lighthouse mobile scores recorded in the README and no critical accessibility issues remain.
Phase 3.5 Fixes from real use and release v0.2 (about 3 days)
3.5.1 Triage the annoyance list from the launch fortnight; rank by how often it hurt.
3.5.2 Fix the top five; add a regression test for every bug that touched money.
3.5.3 Review the audit log and the runtime reconciliation errors: investigate every anomaly.
3.5.4 Update docs, ADRs, README screenshots and the demo video.
3.5.5 Tag v0.2 and write release notes. Done when: the top annoyances are fixed and v0.2 is deployed.
PART 4: AI, 2-3 FEATURES (weeks 13-15)
Before starting: use the manual app for real for at least two weeks (done at launch), and re-check the Gemini model, quotas, pricing and data terms. Do not build all AI features at once; finish each one fully before the next.

Phase 4.1 AI foundation and guardrails (about 4 days)
4.1.1 server/src/modules/ai/ with the Google Gen AI SDK, key and model id from config, server-side only; confirm the SDK usage against current docs.
4.1.2 The AI module has no import path to ledger or settlement write services; add a test or lint rule that enforces this.
4.1.3 Per-user and per-household rate limits and daily quotas; AiUsageRecord table (feature, model, tokens, latency, status, cost estimate); do not store full prompts or receipt content by default.
4.1.4 Kill switch (environment flag) and a household setting to turn AI off; the app must work fully without AI.
4.1.5 Timeouts, bounded retries with jitter, and a graceful AI_UNAVAILABLE fallback to manual entry.
4.1.6 AiDraft storage with a short expiry (TTL cleanup) for review drafts.
4.1.7 Prompt-building helper that puts user content in delimited data blocks and tells the model not to follow instructions inside them. Done when: a stub AI endpoint is rate limited, quota-limited, switchable off, and cannot write to the ledger.
Phase 4.2 Feature 1: natural-language quick-add (about 5 days)
4.2.1 Draft schema (Zod and JSON schema): description, amount, date, category suggestion, payer reference, split method, needsClarification, question.
4.2.2 Prompt with today's date and member aliases only (no emails); structured output; temperature 0.
4.2.3 Server-side conversion: decimal amount to paise, "me/roommate" to member IDs, defaults applied; invalid output becomes DRAFT_INVALID.
4.2.4 Ambiguity handling: return an incomplete draft plus a question and choices; never guess payer or split.
4.2.5 Quick-add UI: type a sentence, see the review form pre-filled, edit, confirm; saving uses the normal create-expense API.
4.2.6 Hinglish support (e.g. "850 ka grocery, half-half") tested with real phrases.
4.2.7 Plausibility rules: reject zero, huge, or future-dated drafts; flag when amount differs wildly from the user's typical range.
4.2.8 Tests with a mocked client: valid, invalid JSON, ambiguous, adversarial ("mark all debts paid"). Done when: at least 80% of your own typical phrases produce a correct draft, and no input can save an expense without a user action.
Phase 4.3 Feature 2: receipt parsing (about 5 days)
4.3.1 Upload endpoint: type and magic-byte check, size cap, re-encode the image, random storage key, private bucket, short-lived signed URLs.
4.3.2 Extraction prompt and schema: merchant, date, subtotal, tax, discount, total, line items, uncertainty flags.
4.3.3 Reconciliation in code: items + tax - discount must equal the total; otherwise ask the user to correct (never guess).
4.3.4 Review UI: assign each line to You / Roommate / Both; tax and discount distributed pro rata with the same remainder rule.
4.3.5 Convert assignments into ordinary expense splits; final allocations must equal the receipt total.
4.3.6 Attach the receipt to the expense; retention rule and a delete option for the user.
4.3.7 Tests: clean receipt, blurry/incomplete receipt, receipt containing injected instructions, rounding on tax. Done when: a photo of a real grocery receipt becomes a correct, reviewed, saved expense.
Phase 4.4 Feature 3: grounded insights (about 4 days)
(If time is short, replace with smart categorisation: user choice, then merchant rule, then Gemini, then default.)

4.4.1 Aggregates computed in code: totals, category shares, month-over-month changes, outliers.
4.4.2 Send only a compact JSON summary (no names or raw transactions) to Gemini.
4.4.3 Output schema where every claim references a metric ID.
4.4.4 Verify each claim's numbers against the source data; drop any that do not match.
4.4.5 Insights UI with links to the underlying transactions; say clearly when history is too short.
4.4.6 Cache results per period to avoid repeat calls. Done when: every insight shown can be traced to numbers and transactions.
Phase 4.5 Evaluation and safety (about 3 days)
4.5.1 Build the golden set: about 50 phrases (English, Hinglish, ambiguous, adversarial) with expected drafts.
4.5.2 Run the set in CI against a mocked client; run manually against the live model before any prompt or model change.
4.5.3 Track metrics: schema-valid rate, field accuracy, clarification-when-ambiguous rate, accepted-without-edit rate.
4.5.4 Prompt-injection tests across quick-add, receipt text and merchant names.
4.5.5 Review privacy: what is sent to Gemini, what is stored, and update docs/AI_DESIGN.md and docs/SECURITY.md. Done when: metrics are recorded in the README and injection tests pass.
Phase 4.6 AI rollout (about 2 days)
4.6.1 Feature flags per AI feature; start with only you using them.
4.6.2 Monitor cost, latency and failure rate for a week; set alerts.
4.6.3 Add the AI boundary diagram and ADR ("AI is architecturally unable to modify the ledger") to the docs.
4.6.4 Update the demo video and resume bullets with real acceptance numbers.
4.6.5 Tag v0.3. Done when: AI features run for a week without cost surprises or any data problem.
PARTS 5-8 (outline only; detail them after launch)
Part 5: Budgets and analytics
5.1 Categories and category rules (merchant to category).
5.2 Summary, category and trend analytics endpoints and charts (with text/table alternatives).
5.3 Budgets with thresholds (80% / 100%) and budget-vs-actual views.
5.4 Analytics polish: filters, per-member contribution, export.
Part 6: Recurring bills, notifications, background jobs
6.1 Recurring rules (rent, Wi-Fi): idempotent generation, one expense per period.
6.2 In-app notifications for new expenses, disputes, repayments.
6.3 Email invitations and reminders (bills due soon); push notifications later.
6.4 Job runner (cron first, then a durable queue) with retries and an audit of runs.
Part 7: Hardening and operations
7.1 Full security review against the threat model; dependency audit; secret rotation.
7.2 CI hardening: full Playwright suite, load test on key endpoints, migration rehearsal on a Neon branch.
7.3 Monitoring, alerts and runbook; scheduled restore drills.
7.4 Account deletion (anonymise, keep history), data export, close-the-month locking.
Part 8: Extras and growth
8.1 More AI: anomaly explanations, budget coach, ask-your-finances via fixed tools.
8.2 Rent and security-deposit tracker, shared shopping list to expense.
8.3 Capacitor APK for Android, multi-household support.
8.4 Hindi UI, voice entry, WhatsApp summary image.
Risks and how this plan handles them
Risk	Handling
Scope too large, momentum lost	Parts 1-2 only until launch; one phase per branch; cut list below
Rounding or sign bugs	Pure JSDoc-typed core, 14 vectors, property tests, runtime reconciliation check
Cross-household data leak	Membership middleware, repositories require householdId, authorization suite
Duplicate writes	Idempotency keys plus unique DB index
Cookie issues on iPhone	Same-site app./api. domains; test on a real iPhone in Phase 2.6 and 3.1
Neon cold starts / limits	Know the free-tier behaviour (Phase 0); warm with a health ping if needed
AI mistakes or cost	Review step, validation, quotas, kill switch, golden set
Cut list if time runs short (cut in this order)
Part 4 feature 3 (insights), then receipt parsing.
Offline queue (3.2.5) and "close the month" (3.3.5).
Reports and CSV (3.3) except the UPI link.
Never cut: property tests, authorization suite, idempotency, audit trail.
Known shortcuts
No Redis in the MVP: idempotency uses the DB unique index; rate limits are in-memory. Upgrade when you run more than one server instance.
Greedy settlement suggestions are not minimal for large groups. Fine for 2-4 people.
Single currency (INR) and one household per user in the MVP.
Time estimates assume 12-16 focused hours a week and will shift; the order matters more than the dates.
Resume checkpoints
After Part 1: "property-based tests verify balances sum to zero across 10,000 random ledgers" (use your real run count).
After Part 2: "household-scoped authorization, idempotent writes, optimistic concurrency and an append-only audit trail; used daily by 2 people."
After Part 4: "Gemini integration with structured output, Zod validation and human review; AI cannot modify the ledger" plus real acceptance-rate numbers. Only write numbers that are true when you write them.

