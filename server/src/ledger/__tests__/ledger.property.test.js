import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { splitEqual, splitByWeights, calculateMemberBalances, suggestSettlements } from "../index.js";

const RUNS = 10000;
const ids = ["a", "b", "c", "d"];
const sum = (xs) => xs.reduce((a, b) => a + b, 0);

const expenseArb = fc
  .record({
    paidBy: fc.constantFrom(...ids),
    amountMinor: fc.integer({ min: 1, max: 10_000_000 }),
    type: fc.constantFrom("shared", "shared", "personal"),
    status: fc.constantFrom("confirmed", "confirmed", "disputed", "reversed"),
    participants: fc.subarray(ids, { minLength: 1 }),
    seed: fc.string({ minLength: 1 }),
  })
  .map(({ paidBy, amountMinor, type, status, participants, seed }) => ({
    paidBy,
    amountMinor,
    type,
    status,
    splits: type === "personal" ? [{ userId: paidBy, shareMinor: amountMinor }] : splitEqual(amountMinor, participants, seed),
  }));

const settlementArb = fc
  .record({
    pair: fc.shuffledSubarray(ids, { minLength: 2, maxLength: 2 }),
    amountMinor: fc.integer({ min: 1, max: 10_000_000 }),
    status: fc.constantFrom("confirmed", "pending", "rejected", "cancelled"),
  })
  .map(({ pair, amountMinor, status }) => ({ fromUserId: pair[0], toUserId: pair[1], amountMinor, status }));

const ledgerArb = fc.record({
  expenses: fc.array(expenseArb, { maxLength: 15 }),
  settlements: fc.array(settlementArb, { maxLength: 10 }),
});

describe("split properties", () => {
  it("equal split sums to the total and differs by at most 1 paisa", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100_000_000 }), fc.integer({ min: 1, max: 8 }), fc.string({ minLength: 1 }), (total, n, seed) => {
        const shares = splitEqual(total, Array.from({ length: n }, (_, i) => `u${i}`), seed).map((s) => s.shareMinor);
        expect(sum(shares)).toBe(total);
        expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(1);
      }),
      { numRuns: RUNS },
    );
  });

  it("weighted split always sums to the total and never depends on input order", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000_000 }),
        fc.array(fc.integer({ min: 1, max: 10_000 }), { minLength: 1, maxLength: 6 }),
        fc.string({ minLength: 1 }),
        (total, weights, seed) => {
          const parts = weights.map((weight, i) => ({ userId: `u${i}`, weight }));
          const result = splitByWeights(total, parts, seed);
          expect(sum(result.map((s) => s.shareMinor))).toBe(total);
          expect(splitByWeights(total, [...parts].reverse(), seed)).toEqual(result);
        },
      ),
      { numRuns: RUNS },
    );
  });
});

describe("ledger properties", () => {
  it("balances always sum to zero and the suggested plan clears every balance", () => {
    fc.assert(
      fc.property(ledgerArb, (ledger) => {
        const net = calculateMemberBalances({ ...ledger, memberIds: ids });
        expect(sum(Object.values(net))).toBe(0);
        const after = { ...net };
        for (const t of suggestSettlements(net)) {
          after[t.from] += t.amountMinor;
          after[t.to] -= t.amountMinor;
        }
        expect(Object.values(after).every((v) => v === 0)).toBe(true);
      }),
      { numRuns: RUNS },
    );
  });

  it("personal, reversed and non-confirmed records never change balances", () => {
    fc.assert(
      fc.property(ledgerArb, (ledger) => {
        const counted = {
          expenses: ledger.expenses.filter((e) => e.type !== "personal" && e.status !== "reversed"),
          settlements: ledger.settlements.filter((s) => s.status === "confirmed"),
        };
        expect(calculateMemberBalances({ ...ledger, memberIds: ids })).toEqual(
          calculateMemberBalances({ ...counted, memberIds: ids }),
        );
      }),
      { numRuns: RUNS },
    );
  });
});
