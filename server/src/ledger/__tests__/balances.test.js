import { describe, it, expect } from "vitest";
import { calculateMemberBalances, suggestSettlements, calculateRefundShares, splitEqual } from "../index.js";

const code = (c) => expect.objectContaining({ code: c });
const memberIds = ["you", "rm"];

const shared = (paidBy, amountMinor, yours, theirs, extra = {}) => ({
  paidBy,
  amountMinor,
  type: "shared",
  status: "confirmed",
  splits: [{ userId: "you", shareMinor: yours }, { userId: "rm", shareMinor: theirs }],
  ...extra,
});

// Worked example from the blueprint, in paise.
const base = [
  shared("you", 200000, 100000, 100000),
  shared("rm", 120000, 60000, 60000),
  shared("rm", 80000, 40000, 40000),
  shared("you", 60000, 30000, 30000),
];
const repay = (from, to, amountMinor, status = "confirmed") => ({
  fromUserId: from,
  toUserId: to,
  amountMinor,
  status,
});
const balances = (expenses, settlements = [], ids = memberIds) =>
  calculateMemberBalances({ expenses, settlements, memberIds: ids });

describe("calculateMemberBalances", () => {
  it("vector 4: worked example -> you +30000, roommate -30000, plan rm pays you 30000", () => {
    const net = balances(base);
    expect(net).toEqual({ you: 30000, rm: -30000 });
    expect(suggestSettlements(net)).toEqual([{ from: "rm", to: "you", amountMinor: 30000 }]);
  });

  it("vector 5: personal expense changes nothing", () => {
    const personal = { paidBy: "you", amountMinor: 150000, type: "personal", status: "confirmed", splits: [{ userId: "you", shareMinor: 150000 }] };
    expect(balances([...base, personal])).toEqual({ you: 30000, rm: -30000 });
  });

  it("vector 6: confirmed repayment of 20000 -> you +10000, rm -10000", () => {
    expect(balances(base, [repay("rm", "you", 20000)])).toEqual({ you: 10000, rm: -10000 });
  });

  it("vector 7: pending, rejected and cancelled repayments change nothing", () => {
    for (const status of ["pending", "rejected", "cancelled"]) {
      expect(balances(base, [repay("rm", "you", 30000, status)])).toEqual({ you: 30000, rm: -30000 });
    }
  });

  it("vector 8: overpayment flips direction", () => {
    expect(balances(base, [repay("rm", "you", 40000)])).toEqual({ you: -10000, rm: 10000 });
  });

  it("vector 9: A pays 9000 split among A, B, C", () => {
    const e = { paidBy: "A", amountMinor: 9000, type: "shared", status: "confirmed", splits: splitEqual(9000, ["A", "B", "C"], "x") };
    const net = balances([e], [], ["A", "B", "C"]);
    expect(net).toEqual({ A: 6000, B: -3000, C: -3000 });
    expect(suggestSettlements(net)).toEqual([
      { from: "B", to: "A", amountMinor: 3000 },
      { from: "C", to: "A", amountMinor: 3000 },
    ]);
  });

  it("vector 10: 20000 refund on a 100000 equal split -> 40000 net share each", () => {
    const original = shared("A", 100000, 50000, 50000);
    original.splits = [{ userId: "A", shareMinor: 50000 }, { userId: "B", shareMinor: 50000 }];
    const refundShares = calculateRefundShares(original.splits, 20000, "r1");
    expect(refundShares.map((s) => s.shareMinor)).toEqual([10000, 10000]);
    const refund = {
      paidBy: "A",
      amountMinor: -20000,
      type: "shared",
      status: "confirmed",
      splits: refundShares.map((s) => ({ userId: s.userId, shareMinor: -s.shareMinor })),
    };
    expect(balances([original, refund], [], ["A", "B"])).toEqual({ A: 40000, B: -40000 });
  });

  it("vector 11: a reversed expense is excluded", () => {
    const reversed = shared("you", 999900, 499950, 499950, { status: "reversed" });
    expect(balances([...base, reversed])).toEqual(balances(base));
  });

  it("disputed expenses still count", () => {
    expect(balances([shared("you", 1000, 500, 500, { status: "disputed" })])).toEqual({ you: 500, rm: -500 });
  });

  it("vector 14: self-settlement is rejected", () => {
    expect(() => balances(base, [repay("you", "you", 100)])).toThrow(code("SELF_SETTLEMENT"));
  });

  it("rejects settlements with a non-member or a bad amount", () => {
    expect(() => balances(base, [repay("ghost", "you", 100)])).toThrow(code("UNKNOWN_MEMBER"));
    expect(() => balances(base, [repay("rm", "you", 0)])).toThrow(code("INVALID_AMOUNT"));
    expect(() => balances(base, [repay("rm", "you", 1.5)])).toThrow(code("INVALID_AMOUNT"));
  });

  it("rejects expenses whose shares do not add up or involve non-members", () => {
    expect(() => balances([shared("you", 1000, 500, 400)])).toThrow(code("SPLIT_MISMATCH"));
    expect(() => balances([shared("ghost", 1000, 500, 500)])).toThrow(code("UNKNOWN_MEMBER"));
  });
});

describe("suggestSettlements", () => {
  it("vector 12: A +5000, B +1000, C -2000, D -4000 -> 3 transfers", () => {
    expect(suggestSettlements({ A: 5000, B: 1000, C: -2000, D: -4000 })).toEqual([
      { from: "D", to: "A", amountMinor: 4000 },
      { from: "C", to: "A", amountMinor: 1000 },
      { from: "C", to: "B", amountMinor: 1000 },
    ]);
  });

  it("returns nothing when everyone is settled", () => {
    expect(suggestSettlements({ A: 0, B: 0 })).toEqual([]);
  });

  it("refuses balances that do not sum to zero", () => {
    expect(() => suggestSettlements({ A: 100, B: -50 })).toThrow(code("LEDGER_NOT_BALANCED"));
  });
});

describe("calculateRefundShares", () => {
  it("splits 20001 pro rata, the extra paisa going to exactly one person", () => {
    const shares = calculateRefundShares([{ userId: "A", shareMinor: 50000 }, { userId: "B", shareMinor: 50000 }], 20001, "r");
    expect(shares.map((s) => s.shareMinor).sort()).toEqual([10000, 10001]);
  });

  it("follows original proportions", () => {
    const shares = calculateRefundShares([{ userId: "A", shareMinor: 75000 }, { userId: "B", shareMinor: 25000 }], 20000, "r");
    expect(shares).toEqual([{ userId: "A", shareMinor: 15000 }, { userId: "B", shareMinor: 5000 }]);
  });

  it("skips people who owed nothing and rejects refunds larger than the original", () => {
    const shares = calculateRefundShares([{ userId: "A", shareMinor: 1000 }, { userId: "B", shareMinor: 0 }], 500, "r");
    expect(shares).toEqual([{ userId: "A", shareMinor: 500 }]);
    expect(() => calculateRefundShares([{ userId: "A", shareMinor: 1000 }], 1001, "r")).toThrow(code("INVALID_REFUND"));
    expect(() => calculateRefundShares([{ userId: "A", shareMinor: 1000 }], 0, "r")).toThrow(code("INVALID_REFUND"));
  });
});
