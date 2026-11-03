# Security (v1, 2026-11-02)

What is enforced today and where. This version covers authentication and the database. Household tenancy (Phase 1.6) is not built yet and is listed under "Not done yet".

## Authentication

| Area | What is enforced | Where |
|---|---|---|
| Passwords | Argon2id (64 MiB, 3 passes, random salt). Plain passwords are never stored or logged. Length 8 to 128 on register and change. | `src/lib/password.js`, `auth.validation.js` |
| Login | One error (`INVALID_CREDENTIALS`) for a wrong email and a wrong password. A dummy hash is checked for unknown emails so both take about the same time. | `auth.service.js` |
| Access token | JWT, HS256, 15 minutes. Algorithm pinned; issuer and audience checked. Sent as `Authorization: Bearer`, kept in client memory. | `src/lib/tokens.js`, `middlewares/authenticate.js` |
| Refresh token | 256 random bits, no meaning. Only its SHA-256 hash is stored. Valid 30 days, single use. | `src/lib/tokens.js`, `RefreshToken` table |
| Refresh cookie | `HttpOnly`, `SameSite=Lax`, `Path=/api/v1/auth`, `Secure` in production. Read only from the cookie, never from the body or a header. | `auth.controller.js` |
| Rotation | Every refresh spends the old token and issues a new one in one transaction. The update is conditional, so of two simultaneous requests exactly one wins. | `auth.repository.js` |
| Reuse detection | A spent token presented again more than 10 seconds later revokes the whole session family and logs a warning. | `auth.service.js` |
| Logout | Revokes the session family and clears the cookie. Idempotent. | `auth.service.js` |
| Password change | Needs the current password. Stores the new hash and revokes every session in one transaction, then starts a fresh session on the calling device. | `auth.service.js`, `auth.repository.js` |

## Requests and responses

| Area | What is enforced | Where |
|---|---|---|
| Input | Every body, param and query goes through a Zod schema. Schemas use `strictObject`, so unknown fields are rejected. Handlers read only `req.valid`. Body limit 100 kb. | `middlewares/validate.js` |
| CSRF | `/auth/refresh` and `/auth/logout` require the header `X-Evenly-Client: web`, and reject a foreign `Origin`. Other sites cannot add the header, and a cross-origin fetch that does needs a CORS preflight that only `CLIENT_ORIGIN` passes. Bearer-token endpoints are not CSRF-able. | `middlewares/csrfGuard.js`, CORS in `app.js` |
| Rate limits | Register 5 per hour, login 10 failed attempts per 15 minutes, refresh 60 per 15 minutes, change-password 5 per 15 minutes, all per IP. Answer is `429 RATE_LIMITED`. | `middlewares/rateLimiter.js` |
| Errors | One envelope with a stable `code`. Unexpected errors return a generic 500; the detail goes only to the log. No stack traces in any response. | `middlewares/errorHandler.js` |
| Logging | JSON logs with a request id. Only method, URL and status are logged: no headers, cookies, tokens or bodies. | `middlewares/requestLogger.js` |
| Headers | `helmet` defaults. CORS allows only `CLIENT_ORIGIN`, with credentials. | `app.js` |

## Database

| Area | What is enforced | Where |
|---|---|---|
| Money integrity | CHECK constraints (amount above 0, share not negative, no self-repayment). A deferred trigger makes an expense's splits add up to its amount at commit. | `20261102090000_checks_and_triggers` |
| Audit history | `UPDATE` and `DELETE` on `AuditEvent` raise an error. | same migration |
| Secrets in responses | Only `auth.repository.js` can read `passwordHash`, through two named functions. Every other user read selects public fields only. | `auth.repository.js`, `users.repository.js` |
| Tenant scoping | The expense and household repositories refuse to run without a `householdId`. A test checks every exported function and fails if a new one is not scoped (or deliberately listed as an exception). | `lib/tenant.js`, `expenses/expense.repository.js`, `households/household.repository.js` |
| Secrets in config | `JWT_ACCESS_SECRET` (32 characters or more) and the database URLs are validated at startup. The server refuses to start without them. `.env` is not committed. | `src/config/env.js` |
| Test safety | Tests are redirected to `TEST_DATABASE_URL`. The wipe helper refuses to run on the dev database. Tests run on one worker, one file at a time, because they share and wipe one database. | `src/test/`, `vitest.config.js` |

## Tenancy (households)

The household is the tenant boundary. Knowing an id never grants access. Decision record: [ADR 003](ADR/003-tenancy-and-authz.md).

| Area | What is enforced | Where |
|---|---|---|
| Membership check | Every `/households/:householdId/...` route runs `householdMembership` after `authenticate`. It loads the caller's active membership of a non-archived household. The route file puts the check on each such route. | `middlewares/householdMembership.js`, `household.routes.js` |
| The 404 rule | A stranger, a member who left, an archived household and an id that does not exist all return the same `404 NOT_FOUND`, so ids cannot be probed. A test compares a real and a made-up id on read and write routes. | `householdMembership.js`, `authorization.db.test.js` |
| Roles | Changing settings and creating invitations are owner-only. A member gets `403` (their membership is real, so nothing leaks); a non-member gets `404`. | `household.service.js` |
| Invitations | 256-bit random token, only its SHA-256 hash stored, shown once. Valid 7 days, single use, optional email lock, at most 10 open per household. The token travels in the request body, never the URL. | `household.service.js`, `household.repository.js` |
| Accepting | One transaction with a conditional update, so of two simultaneous accepts exactly one wins. Every failure (wrong, used, expired, wrong email, archived household) returns the same `400 INVALID_INVITATION`. Accept is rate limited. | `household.repository.js`, `rateLimiter.js` |
| Leaving | Blocked unless the leaver's net balance is exactly 0 (computed from the whole ledger). An owner with other members must name a new owner; the last person out archives the household. All writes are one transaction. | `household.service.js` |
| What members see | Roommates see each other's names and roles, never email addresses. | `household.service.js` |

The authorization suite (`households/__tests__/authorization.db.test.js`) and the end-to-end Part 1 gate test (`src/__tests__/part1.gate.db.test.js`) run against a real database.

## Known limits

- **Rate limits are per IP and in memory.** They reset on restart and are not shared between servers. Someone behind the same IP as you shares your allowance. Move to a shared store before running more than one instance.
- **Reuse detection has a 10-second grace window**, so two tabs racing are not mistaken for theft. A thief replaying inside that window is not caught.
- **Access tokens cannot be revoked.** After logout or a password change, an already-issued access token still works for up to 15 minutes. `GET /users/me` checks the account exists; the middleware itself does not.
- **Register reveals whether an email has an account** (`EMAIL_TAKEN`). Hiding it needs email verification.
- **`Secure` cookies are off outside production**, so plain `http://localhost` works.
- **An open invitation link works for whoever holds it** unless it was locked to an email. Locking is optional; the owner chooses.
- **Exactly one owner is enforced by the service**, inside the transaction, not by a database constraint.
- **The leave check loads the household's whole ledger.** Fine at household scale; revisit if ledgers grow large.
- **Household changes are not written to the audit log** (it is for financial changes). Joins, leaves and ownership changes are visible only in the membership rows.
- **Trust proxy is set to one hop in production.** Check the real hop count when deploying, or IP limits will see the proxy instead of the client.

## Not done yet

- Removing another member (members can only leave), and emailing invitations (the owner copies the link).
- Idempotency keys, and optimistic locking on edits (Part 2).
- Email verification and password reset.
- CI. The real-database tests (races, token rotation) run locally against a separate Neon test branch, but nothing runs them automatically on a push.
- Dependency auditing and a full review against the threat model (Part 7).
