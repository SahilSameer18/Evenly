import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { calculateMemberBalances, calculateRefundShares, splitEqual } from "../index.js";

// A refund is stored with positive numbers and counts the other way: the payer paid less, everyone owes less.

const original = {
  paidBy: "A",
  amountMinor: 100000,
  type: "shared",
  status: "confirmed",
  splits: [{ userId: "A", shareMinor: 50000 }, { userId: "B", shareMinor: 50000 }],
};
const refundOf = (of, amountMinor, seed, extra = {}) => ({
  paidBy: of.paidBy,
  amountMinor,
  type: "refund",
  status: "confirmed",
  splits: calculateRefundShares(of.splits, amountMinor, seed),
  ...extra,
});
const net = (expenses, memberIds = ["A", "B"]) => calculateMemberBalances({ expenses, settlements: [], memberIds });

describe("refunds in the balance", () => {
  it("vector 10: a 20000 refund on a 100000 equal split leaves a net share of 40000 each", () => {
    expect(net([original, refundOf(original, 20000, "r1")])).toEqual({ A: 40000, B: -40000 });
  });

  it("two partial refunds add up", () => {
    expect(net([original, refundOf(original, 20000, "r1"), refundOf(original, 30000, "r2")])).toEqual({ A: 25000, B: -25000 });
  });

  it("a full refund cancels the expense completely", () => {
    expect(net([original, refundOf(original, 100000, "r1")])).toEqual({ A: 0, B: 0 });
  });

  it("a reversed refund is ignored, giving the amount back to the original", () => {
    expect(net([original, refundOf(original, 20000, "r1", { status: "reversed" })])).toEqual({ A: 50000, B: -50000 });
  });

  it("a disputed refund still counts, like any disputed expense", () => {
    expect(net([original, refundOf(original, 20000, "r1", { status: "disputed" })])).toEqual({ A: 40000, B: -40000 });
  });

  it("works for an on-behalf expense: the beneficiary owes less", () => {
    const onBehalf = { paidBy: "A", amountMinor: 600, type: "on_behalf", status: "confirmed", splits: [{ userId: "B", shareMinor: 600 }] };
    expect(net([onBehalf, refundOf(onBehalf, 200, "r1")])).toEqual({ A: 400, B: -400 });
  });

  it("still insists the refund's shares add up to its amount", () => {
    const broken = { ...refundOf(original, 20000, "r1"), amountMinor: 20001 };
    expect(() => net([original, broken])).toThrow(expect.objectContaining({ code: "SPLIT_MISMATCH" }));
  });
});

describe("refund properties", () => {
  const people = ["a", "b", "c"];
  const expenseArb = fc.record({
    payer: fc.constantFrom(...people),
    who: fc.subarray(people, { minLength: 1 }),
    amount: fc.integer({ min: 1, max: 10_000_000 }),
    seed: fc.string({ minLength: 1 }),
  });
  const build = ({ payer, who, amount, seed }) => ({
    paidBy: payer,
    amountMinor: amount,
    type: "shared",
    status: "confirmed",
    splits: splitEqual(amount, who, seed),
  });

  it("a full refund always brings every balance back to zero", () => {
    fc.assert(
      fc.property(expenseArb, (spec) => {
        const expense = build(spec);
        const balances = net([expense, refundOf(expense, expense.amountMinor, `${spec.seed}-refund`)], people);
        expect(Object.values(balances).every((v) => v === 0)).toBe(true);
      }),
      { numRuns: 2000 },
    );
  });

  it("any partial refund still leaves the balances adding up to zero", () => {
    fc.assert(
      fc.property(expenseArb, fc.double({ min: 0.001, max: 1, noNaN: true }), (spec, fraction) => {
        const expense = build(spec);
        const amount = Math.max(1, Math.floor(expense.amountMinor * fraction));
        const balances = net([expense, refundOf(expense, amount, `${spec.seed}-refund`)], people);
        expect(Object.values(balances).reduce((a, b) => a + b, 0)).toBe(0);
      }),
      { numRuns: 2000 },
    );
  });
});
