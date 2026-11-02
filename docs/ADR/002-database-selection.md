# ADR 002: PostgreSQL on Neon with Prisma

Status: accepted, 2026-11-02

## Context

Evenly stores money records that must stay consistent: an expense, its splits and its audit event are written together or not at all. The blueprint compared MongoDB (Mongoose) and PostgreSQL (Prisma) and recommended Postgres for the strongest integrity story.

## Decision

Use **PostgreSQL on Neon**, accessed through **Prisma 7**.

- Foreign keys, `CHECK` constraints (amount > 0, share >= 0, sender != recipient) and a deferred constraint trigger (the splits of an expense add up to its amount) let the database defend the ledger invariants even if application code regresses.
- Transactions are first-class, so expense, splits and audit event commit atomically.
- Totals and per-member aggregates are natural in SQL.
- Neon gives a free tier, branches for staging and test databases, and point-in-time restore.
- Prisma and Neon are already used in the author's other projects.

Prisma needs two connection strings: `DATABASE_URL` (pooled, used by the running app) and `DIRECT_URL` (used by `prisma migrate`).

## Consequences

- Prisma does not manage triggers or some `CHECK` constraints, so those live in hand-written SQL migration files and are documented.
- Neon's free tier suspends idle databases, so the first request after a pause can be slow (measured: about 1.7 s cold, about 0.5 s warm).
- The Neon driver adapter is used so Prisma connects through Neon.
- Money columns are `Int` (paise), enough for about 21 million rupees per amount.

## Alternatives considered

- **MongoDB + Mongoose:** fast to start, but integrity rules would live only in application code, and multi-document transactions need a replica set.
- **SQLite:** simplest, but not a good fit for a multi-user hosted app.
