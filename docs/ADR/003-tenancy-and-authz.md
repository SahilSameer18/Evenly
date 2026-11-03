# ADR 003: Tenancy by household, and the 404 rule

Status: accepted, 2026-11-03

## Context

Evenly holds money records shared by a small group. A household's data must never be visible to anyone outside it, even if they guess or are handed an id. The most common way apps leak this is IDOR: a route loads a record by id and forgets to check that the caller belongs to its owner.

## Decision

1. **The household is the tenant.** Every household-owned table carries `householdId`.
2. **Membership is checked in one middleware.** `householdMembership` runs after `authenticate` on every `/households/:householdId/...` route. It loads the caller's *active* membership of a *non-archived* household and puts it on `req.membership`. Handlers take `householdId` and the role from there, never from the request body.
3. **Non-members get 404, not 403.** A stranger, a member who has left, an archived household and an id that does not exist all return the same `404 NOT_FOUND`. A caller therefore cannot learn which household ids exist. A real member who lacks the role for an action gets `403`, because their membership is already known to them.
4. **Repositories cannot forget the tenant.** Every household-scoped repository function takes `householdId` first and calls `scoped()` (`lib/tenant.js`), which throws if it is missing. A test lists each repository's exports and fails if a new function is neither scoped nor deliberately listed as an exception.
5. **Roles are owner and member.** Only the owner changes settings or creates invitations. An owner must hand over ownership before leaving; the last person out archives the household.
6. **Joining is by single-use invitation.** The link carries a 256-bit random token (only its hash is stored), expires in 7 days, can be locked to one email, and is accepted in a transaction so only one accept can win. Every failure returns the same answer.
7. **A person has one membership row per household.** The `(householdId, userId)` unique index forbids duplicates, so someone who left and returns has their row revived instead of a second row created.

## Why

- **One middleware** means the check cannot be skipped on a single route by accident, and a reviewer has one place to read.
- **404 over 403** removes an oracle. With 403 an attacker could enumerate valid household ids.
- **A guard inside the repository** is the second line of defence: even if a route forgets the middleware, a query without a `householdId` fails loudly in the first test run instead of returning other households' rows.
- **Archive instead of delete** keeps history, in line with the append-only principle (ADR 001).

## Consequences

- Every new household route must be added behind `householdMembership`. The pattern is visible in `household.routes.js`.
- Tests for tenancy need a real database, so they run against a separate Neon test branch.
- A user's identity comes only from the verified access token; there is no endpoint that takes a user id to act as.
- The leave check reads the whole household ledger. That is fine at this scale and flagged in the code.

## Alternatives considered

- **Return 403 for non-members:** simpler to debug, but reveals which ids exist.
- **Row-level security in Postgres:** strongest guarantee, but it needs a per-request database role or setting and does not fit Prisma and pooled connections easily. Worth revisiting later.
- **A `householdId` taken from the request body or a header:** rejected; the id in the URL is checked against membership, and the body is never trusted for it.
