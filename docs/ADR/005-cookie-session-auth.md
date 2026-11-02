# ADR 005: Sessions with a short-lived access token and a rotating refresh cookie

Status: accepted, 2026-11-02

## Context

Evenly holds financial records, so a stolen login is costly. The app is a single-page client talking to a separate API. We need sessions that survive page reloads, can be ended by the server, and do not leave a long-lived secret where page scripts can read it.

## Decision

1. **Access token:** a signed JWT valid for 15 minutes, returned in the response body and held in client memory only (never `localStorage`). It is sent as `Authorization: Bearer`.
2. **Refresh token:** 256 random bits with no meaning, valid 30 days, delivered only as an `HttpOnly`, `SameSite=Lax` cookie scoped to `Path=/api/v1/auth` (`Secure` in production). The database stores only its SHA-256 hash.
3. **Rotation:** every refresh spends the presented token and issues a new one, in one transaction, with a conditional update so only one of two simultaneous requests wins.
4. **Families and reuse detection:** all tokens from one login share a `familyId`. A spent token presented again after a 10-second grace window revokes the whole family.
5. **Ending sessions:** logout revokes the family. A password change revokes every session of that user.
6. **CSRF:** the two endpoints that act on the cookie require a custom header and reject a foreign `Origin`.

## Why

- **Why not keep tokens in `localStorage`.** Any script injected into the page could read them. An `HttpOnly` cookie cannot be read by scripts, and the access token in memory disappears on reload and lives 15 minutes.
- **Why the refresh token is not a JWT.** A JWT is valid until it expires and cannot be taken back. A refresh token must be revocable and detectable when reused, so it is an opaque value that only the database can vouch for.
- **Why a fast hash for it.** Refresh tokens are unguessable random values, so SHA-256 is enough. Passwords are guessable and use Argon2id instead.
- **Why rotation and families.** If a token is copied, the next refresh by either party exposes it, and revoking the family forces both to log in again. Without rotation, a stolen token would work silently for 30 days.
- **Why the grace window.** Two tabs can refresh at once and one will present a token the other just spent. That is a race, not theft, so it is rejected without punishing the session.
- **Why `SameSite=Lax` plus a header.** Lax stops most cross-site cookie sending. The custom header covers the rest, because other sites cannot add it without passing CORS.

## Consequences

- The client must call `/auth/refresh` when it sees `TOKEN_EXPIRED`, and must send `X-Evenly-Client: web` on refresh and logout.
- Frontend and API need to share a site (for example `app.` and `api.` subdomains), or the cookie is treated as cross-site. This matters most on iOS Safari and must be tested on a real phone before launch.
- Access tokens cannot be revoked early: after logout they still work until they expire (at most 15 minutes).
- The grace window means a thief replaying within 10 seconds of the real client is not detected.
- Refresh tokens add one table (`RefreshToken`) and a cleanup job for expired rows later.

## Alternatives considered

- **Server-side sessions with a session id cookie:** simple and revocable, but every request hits the database, and it does not suit a separately hosted client as well.
- **A single long-lived JWT:** least code, but a leak is valid for its whole life and cannot be revoked.
- **Refresh token as a JWT:** adds nothing, since the database lookup is needed for rotation anyway.
