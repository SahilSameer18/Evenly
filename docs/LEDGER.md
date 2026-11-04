The Ledger Explained: formulas, steps, core ideas, and why
All amounts are integer paise (₹1 = 100 paise). All examples below were run and checked, not just worked by hand.

1. Core ideas (the "why" behind everything)
Idea	What it means	Why we do it
Integer paise only	Store 125000, never 1250.00	Floats give 0.1 + 0.2 = 0.30000000000000004. In a ledger, one lost paisa breaks "sum = 0" forever.
Payer, beneficiary, repayment are three different things	Who paid is not who owes; a repayment is its own record	Mixing them is the #1 bug in expense apps. "A paid ₹900 for B" must not look the same as "A paid ₹900 for both".
Server recomputes balances	Clients never send a balance; balances are never stored	A stored balance can drift from the transactions. A computed one can always be explained and re-proved.
Append-only history	Corrections are reversals plus new entries; no deleting confirmed records	You can always answer "why is this number what it is?", and nobody can silently change history.
Pure core	server/src/ledger/ has no database, no clock, no randomness, no HTTP	Pure functions are deterministic, so they can be tested exhaustively and trusted.
Deterministic rounding	Leftover paise go to a fixed rule, never random	Same input always gives the same split on every machine. Needed for tests and for trust.
AI is advisory	Gemini drafts; code validates; a human confirms; the normal service saves	A model can be wrong or tricked. The ledger must never depend on it.
Tenant isolation	Every query carries householdId from verified membership	Otherwise knowing an ID leaks another household's money.
2. The main formula
For every member u:

Net(u) = Paid(u) - Share(u) + Sent(u) - Received(u)
Paid(u): sum of confirmed shared expenses that u paid (full amount).
Share(u): sum of the amounts assigned to u across those expenses.
Sent(u) / Received(u): confirmed repayments only.
Net > 0: u is owed money. Net < 0: u owes money. Net = 0: settled.
Why this form: every expense adds +amount to one person (payer) and -share to each beneficiary, and the shares add up to the amount, so the whole thing sums to zero by construction. A repayment adds +x to the sender and -x to the recipient, also zero. So Σ Net = 0 always, and if it ever isn't, there is a bug and the code throws LEDGER_NOT_BALANCED.

Sign check for repayments: if you owe ₹300 (Net = -300) and you send ₹200, your Net becomes -300 + 200 = -100. Correct: you still owe ₹100.

Worked example (from the blueprint, verified)
Expense	Payer	Amount	You	Roommate
Groceries	You	2000	1000	1000
Electricity	Roommate	1200	600	600
Wi-Fi	Roommate	800	400	400
Item	You	600	300	300
You: Paid 2600, Share 2300, Net = +300.
Roommate: Paid 2000, Share 2300, Net = -300.
Roommate owes You ₹300. A ₹1,500 personal purchase changes nothing here.
3. Splitting: one rule for everything
Algorithm (largest remainder), for any split by weights w₁…wₙ with total weight W:

For each person: num = total × wᵢ.
share = floor(num / W), remainder = num mod W.
left = total - Σ share (always 0 ≤ left < n).
Give +1 paisa to the people with the largest remainder, one each, until left = 0. Break ties by hash(seed + userId), then by userId. The seed is the expense id, so the same expense always splits the same way, but the extra paisa does not always land on the same person across expenses.
Equal split = every weight is 1. Percentage = weights are basis points (1% = 100 bps, total 10000). Shares (2:1:1) = weights 2, 1, 1. Exact amounts = no maths, just check Σ shares = total or reject with SPLIT_MISMATCH.

Why one rule: one function means one place to test and one set of edge cases. The blueprint writes equal split and bps split separately; they are the same algorithm, so I'd write it once.

Why basis points: 60% as the float 0.6 breaks (0.6 is not exact in binary). 6000 bps is an integer.

Why largest remainder: the person closest to deserving the extra paisa gets it, so errors never pile up on one person.

Overflow check: total × weight is at most about 10⁹ × 10⁴ = 10¹³, safe in JavaScript integers (limit about 9 × 10¹⁵).

Checked examples
Input	Result
10000 equal among A, B, C	one person gets 3334, the other two 3333 (sum 10000); who gets the extra paisa depends on the seed
100 equal among A, B, C	one person gets 34, the other two 33; who depends on the seed
10001 by bps A 6000 / B 4000	A 6001, B 4000 (A's remainder 6000 > B's 4000)
10001 by weights 2:1:1	A 5001, B 2500, C 2500
Properties to test: shares always sum to the total; equal-split shares differ by at most 1 paisa; the order of the input list never changes the result; over many expenses the extra paisa is spread across people.

4. Amount parsing (toMinor)
input "1,250.5"  →  strip commas  →  match ^(\d+)(?:\.(\d{1,2}))?$
paise = whole × 100 + decimals padded to 2 digits   →  125050
Why a string parser: 1250.5 × 100 in floating point can give 125049.99999999999. Parsing the text avoids multiplication of floats entirely. Reject 3+ decimals, negatives, empty strings and junk (1e3).

formatMoney(minor) (dividing by 100 for display) is display only and must never feed back into calculations.

5. Settlement suggestions (who pays whom)
Algorithm (greedy):

Split members into creditors (Net > 0) and debtors (Net < 0, using -Net).
Sort each list by amount descending, then userId.
Repeatedly take the biggest debtor and biggest creditor; transfer min(debt, credit); reduce both; drop whoever hits 0.
Checked example (vector 12): A +5000, B +1000, C -2000, D -4000 gives D→A 4000, C→A 1000, C→B 1000 (3 transfers).

Facts: it always zeroes every balance and uses at most n - 1 transfers. It is not always the global minimum for big groups (that is a harder problem), which is irrelevant for 2-4 people.

Why suggestions are never stored or auto-applied: a suggestion is only advice. Money only moves when a person records a repayment and the other person confirms it.

6. Repayment lifecycle
Pending ──(recipient confirms)──> Confirmed   (changes balances)
   ├──(recipient rejects)──────> Rejected     (no effect)
   └──(sender cancels)─────────> Cancelled    (no effect)
Only Confirmed counts in Sent/Received. Why: a one-sided claim ("I paid you") must not change your balance until you agree.
The transition is a conditional update (WHERE status = 'pending') so a double click cannot confirm twice.
Overpayment is allowed and flips direction. Example: roommate owes 300, sends 400 → roommate Net = +100 (now You owe them 100).
Rules: sender ≠ recipient; both are active members; amount > 0.
Worked: start +300 / -300, confirmed repayment of 200 → You +100, Roommate -100. Pending 300 → unchanged.

7. Reversals and refunds
Reverse: mark the expense reversed and exclude it; keep the row and write an audit event with the reason. Balances must equal the ledger without it. Why: deleting loses history and breaks "why is this number what it is". Reversing again changes nothing and writes no second event. An expense that still has refunds cannot be reversed: reverse the refunds first.
Refund (pro rata): a refund is its own record, of type refund, linked to the expense it gives money back on. It is stored with positive numbers like any expense, and the ledger counts it the other way round: the payer paid less, and each person owes less. Its shares use the original shares as weights, with the same remainder rule.
20000 refund on a 100000 equal split between A and B: weights 50000:50000 → 10000 each. A ends at +40000 and B at -40000.
20001 refund: one of A, B gets 10001 and the other 10000 (tie broken by the seed hash, then userId).
Why original shares: each person gets back the proportion they originally paid for.
Refunds of one expense can never add up to more than its amount. A refund of the full amount cancels the expense exactly. A reversed refund is ignored, which gives its amount back to the original.
Refunds count as a negative Paid/Share, so the invariant (Σ net = 0) still holds. Why store positive numbers: the database insists that amounts are above zero, which keeps one of its guards intact.
Expense status and who can change it
Status	Counts in balances	How an expense gets there
confirmed	yes	created; edited; or a dispute withdrawn
disputed	yes	another member disputes it, with a reason
reversed	no	the person who recorded it reverses it, with a reason (final: a reversed expense is never edited or reopened)
Transitions: confirmed → disputed (any member except the one who recorded it); disputed → confirmed (the person who raised it withdraws it, or the person who recorded it edits it); confirmed or disputed → reversed (the person who recorded it). Only the person who recorded an expense can edit or reverse it. Every transition adds 1 to the version and writes an audit event. An edit needs the current version, so two people changing the same expense at once cannot overwrite each other: one succeeds and the other gets 409 STALE_VERSION.
8. Receipt maths
Receipt: items 700 + 200 + 100 = ₹1000, tax 5% = ₹50, no discount, total ₹1050.

Reconcile first: Σ items + tax - discount = total. If not, ask the user to fix it. Never guess. Why: OCR/LLM reading errors are the most likely source of wrong money.
Assign items: You 350 + 200 = 550, Roommate 350 + 100 = 450 (shared item split equally).
Distribute tax/discount pro rata: use each person's item subtotal as the weight on the tax (5000 paise): You 2750, Roommate 2250.
Final shares: You 57,750 paise, Roommate 47,250 paise = 105,000 = receipt total ✓.
Everything is the same split rule from section 3, so there is no new rounding logic.

9. Percent thresholds (budgets) without floats
"Spent has reached 80% of limit" → compare integers: spent × 100 >= limit × 80. Why: spent / limit >= 0.8 can misfire at exact boundaries (79.99%, 80%, 100%). Integer cross-multiplication is exact.

10. Time and month boundaries
Store timestamps in UTC; decide the month using the household timezone (IST = UTC+5:30).

1 Nov 00:10 IST = 31 Oct 18:40 UTC. In IST it belongs to November; in UTC it would wrongly fall in October.
Correction to the blueprint: it says 23:50 IST on 31 October "is already November in UTC". That is backwards: 23:50 IST = 18:20 UTC, still October. The real edge case is just after midnight IST, as above. Use that case in the test.
11. Concurrency and duplicates
Optimistic locking (edits):

UPDATE expense SET ..., version = version + 1
WHERE id = $1 AND household_id = $2 AND version = $expected AND status <> 'reversed'
If 0 rows changed, return 409 STALE_VERSION. Why: two people editing at once must not silently overwrite each other, and no lock is held while a user thinks.

Idempotency (creates):

Client makes a UUID Idempotency-Key when the form opens.
Server stores it with the record under a unique index (userId, key).
Same key + same payload → return the existing result. Same key + different payload → 422.
Why: double taps and network retries are normal on phones; without this, one tap can create two ₹6000 rent expenses.
Why the DB index, not Redis: the database is the one place that can enforce "only one" atomically with the insert.
Transaction: expense + splits + audit event are written together or not at all.

12. The full flow of one expense (all the steps)
Authenticate; load the caller's active membership for the household (else 404).
Validate the request with Zod (.strict(), integer paise, enums, no future date).
Check payer and every beneficiary are active members.
Run the split engine (section 3) to get shares.
Assert Σ shares = amount (code check, then a database constraint).
Open a transaction: insert expense, splits, audit event.
Commit; return the expense and the freshly computed balances.
Reconciliation check: recompute balances; if Σ ≠ 0, log an error with the request ID.
Why this order: cheap checks first (auth, validation), money maths in pure code, and the database as the last line of defence (CHECK constraints and the deferred sum trigger) in case application code regresses.

13. Invariants (these are your tests)
#	Invariant	Enforced by
I1	For every confirmed expense, Σ shares = amount	Split engine, service check, DB trigger
I2	Σ member net balances = 0	Balance function throws; property tests
I3	All money is integer paise	Zod int(), lint, tests
I4	Personal expenses never affect shared balances	Input filter + tests
I5	Pending/rejected settlements never change balances	Input filter + tests
I6	Confirmed records are never deleted, only reversed	No DELETE route, repository guard
I7	Same idempotency key + payload → one record	Unique index
14. Why this build order
Ledger core first: if the maths is wrong, nothing else matters, and pure code is the cheapest thing to prove.
Database next: constraints turn rules into guarantees even if code changes later.
Auth and households before expenses: tenancy must exist before data does; adding it later means rewriting every query.
API before UI: the API tests prove the money flow; the UI is then only presentation.
Launch, use it, then PWA, then AI: real use finds the problems no plan can; AI is the riskiest and least necessary, so it comes last.15. Repayments and the ledger view (Phase 2.3)
A repayment is a claim until the person being paid agrees it arrived (ADR 007).
pending → confirmed (recipient), rejected (recipient), cancelled (sender). Only confirmed repayments count in balances. Overpaying is allowed and flips the direction.
Net = Paid − Share + Sent − Received, per member. GET /balances returns net plus those four parts, so every number can be explained.
GET /ledger lists expenses, refunds and repayments oldest first (ties by id) with each member's running balance after each entry. Reversed expenses and unconfirmed repayments appear with counted: false and no change. Personal expenses never appear. The last running balance equals the net (explainLedger in server/src/ledger/explain.js, property-tested).
GET /settlement-suggestions calls suggestSettlements on the confirmed balances. Advice only: nothing is stored, and following it (each repayment confirmed) clears every balance.
Worked example, through the API: Alice pays 2000 and 600, Bob pays 1200 and 800, all split equally → Alice +300, Bob −300 rupees (30000 paise). A pending repayment changes nothing; confirming 200 gives +100 / −100; 400 flips to −100 / +100.
Runtime check (section 12, last step): after each money-changing write the books are recomputed; a failure is logged with the request id and never fails the request.
