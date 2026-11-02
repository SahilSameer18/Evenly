# Evenly: Product Requirements

Status: draft, 2026-11-02. Edit freely; this is the scope contract for the MVP.

## Problem

Two people share a flat. One pays for groceries, the other for electricity and Wi-Fi, and sometimes one buys something only they use. Each remembers the totals differently, and nobody can prove who owes whom.

The hard part is not recording amounts. It is keeping an accurate balance over many transactions and being able to explain every number.

## Users

| User | Needs |
|---|---|
| The organiser (the author) | Fast entry, an accurate balance, a clear history, reports later |
| The casual roommate | One-tap confirm, a plain "what do I owe", an easy way to dispute an entry |

Both use the app on a phone. The data model supports larger households from day one, but the MVP is tested with two people.

## MVP scope (Parts 1 and 2 of the plan)

- Sign up, log in, log out, with individual accounts.
- Create a household and invite a roommate with a single-use link.
- Add shared, personal and on-behalf expenses with equal, exact, percentage or weighted splits.
- See who owes whom, with every balance traceable to individual transactions.
- Record a repayment; the recipient confirms or rejects it before it counts.
- Edit, reverse or dispute an expense without erasing history (append-only audit trail).
- Works on a phone-sized screen.

## Non-goals

- No bank connections and no moving of real money. A repayment counts only when the recipient confirms it in the app.
- No multi-currency. INR only.
- No AI financial advice. AI features (later) only draft entries; a person confirms every one.
- No full accounting features for businesses.

## Principles

1. The ledger comes first, the expense tracker second, AI third.
2. Money is stored as integer paise. Balances are always computed, never stored.
3. History is append-only: corrections are reversals, not deletes.
4. A household's data is never visible to anyone outside it.

## Success metrics (targets, not results)

| Goal | Target |
|---|---|
| Accuracy | Balances sum to zero across 10,000 random ledgers in tests; zero reconciliation errors in real use |
| Low friction | An expense is saved in about 10 seconds |
| Transparency | Every balance links to a breakdown of its transactions |
| Reliability | No duplicate expenses from double taps or retries; no cross-household access |
| Adoption | Both roommates use it for two weeks after launch |

## Open decisions

Defaults taken from the plan; change them here if you disagree.

- Personal expenses are visible to their owner only and never count in shared balances.
- A new expense counts immediately; the other person can dispute it.
- A disputed expense still counts until resolved.
