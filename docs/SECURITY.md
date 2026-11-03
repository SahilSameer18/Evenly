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
| Tenant scoping | The expense repository refuses to run without a `householdId`. A test checks every exported function. | `expenses/expense.repository.js` |
| Secrets in config | `JWT_ACCESS_SECRET` (32 characters or more) and the database URLs are validated at startup. The server refuses to start without them. `.env` is not committed. | `src/config/env.js` |
| Test safety | Tests are redirected to `TEST_DATABASE_URL`. The wipe helper refuses to run on the dev database. | `src/test/` |

## Known limits

- **Rate limits are per IP and in memory.** They reset on restart and are not shared between servers. Someone behind the same IP as you shares your allowance. Move to a shared store before running more than one instance.
- **Reuse detection has a 10-second grace window**, so two tabs racing are not mistaken for theft. A thief replaying inside that window is not caught.
- **Access tokens cannot be revoked.** After logout or a password change, an already-issued access token still works for up to 15 minutes. `GET /users/me` checks the account exists; the middleware itself does not.
- **Register reveals whether an email has an account** (`EMAIL_TAKEN`). Hiding it needs email verification.
- **`Secure` cookies are off outside production**, so plain `http://localhost` works.
- **Trust proxy is set to one hop in production.** Check the real hop count when deploying, or IP limits will see the proxy instead of the client.

## Not done yet

- Household membership checks and the 404-for-non-members rule (Phase 1.6), and the authorization test suite.
- Single-use invitation links.
- Idempotency keys, and optimistic locking on edits (Part 2).
- Email verification and password reset.
- CI. The real-database tests (races, token rotation) run locally against a separate Neon test branch, but nothing runs them automatically on a push.
- Dependency auditing and a full review against the threat model (Part 7).
