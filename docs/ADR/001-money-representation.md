# ADR 001: Money representation and rounding

Status: accepted, 2026-11-02

## Context

Evenly is a ledger. A single lost paisa breaks the rule that all balances sum to zero, and that rule is how bugs are detected. JavaScript floats cannot represent most decimal amounts exactly (`0.1 + 0.2 = 0.30000000000000004`), and splits like 100 among 3 people never divide evenly.

## Decision

1. **Integer paise only.** Every amount is stored and computed as an integer number of paise (1 rupee = 100 paise). Percentages are basis points (1% = 100 bps).
2. **Parse text, don't multiply floats.** `toMinor("1,250.5")` reads the digits of the string and never multiplies a float. It rejects negatives, three or more decimals, exponents and junk. `formatMoney` divides by 100 for display only and is never used in calculations.
3. **One split rule.** Equal, percentage and weighted splits are all the same largest-remainder algorithm with different weights: `floor(total × weight / totalWeight)` for each person, then the leftover paise go to the people with the largest remainders.
4. **Tie-break by hash, not by user id.** When remainders tie, the leftover paise go in order of `hash(seed + userId)`, then `userId`. The seed is the expense id.
5. **Balances are computed, never stored.** `Net = Paid - Share + Sent - Received`, recomputed from confirmed records. If the sum is not zero the code throws `LEDGER_NOT_BALANCED`.
6. **A pure core.** `server/src/ledger/` has no database, clock, randomness or HTTP, so it can be tested exhaustively.

## Why the hash tie-break

Breaking ties by user id makes the same person absorb the extra paisa on every odd split, forever. For an app about fairness that is a small but systematic bias. Hashing the expense id with the user id is still fully deterministic (the same expense always splits the same way, on every machine) but spreads the extra paisa across people over many expenses. A test checks this: over 300 expenses of 100 paise among 3 people, each person gets the extra paisa more than 60 times.

## Consequences

- Split functions need a non-empty `seed` string. The server must have the expense id (or another stable id) before calling the ledger.
- Test vectors assert the shape of a split (for example 3334 / 3333 / 3333), not which person gets the extra paisa.
- Amounts are limited to safe integers; the split functions reject totals that would overflow.

## Alternatives considered

- **Decimal library:** adds a dependency and still needs a rounding rule.
- **Tie-break by user id:** simpler, but biased as described above.
- **Random tie-break:** unfair in a different way and not reproducible, which breaks tests and audits.
