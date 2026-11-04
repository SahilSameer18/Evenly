import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { calculateMemberBalances, calculateRefundShares, explainLedger, splitEqual } from "../index.js";

// The blueprint's worked example, in paise: you and your roommate.
const ids = ["you", "rm"];
const exp = (id, at, paidBy, amountMinor, yours, theirs, extra = {}) => ({
  id,
  at,
  label: id,
  paidBy,
  amountMinor,
  type: "shared",
  status: "confirmed",
  splits: [{ userId: "you", shareMinor: yours }, { userId: "rm", shareMinor: theirs }],
  ...extra,
});
const worked = [
  exp("groceries", "2026-10-01T10:00:00Z", "you", 200000, 100000, 100000),
  exp("electricity", "2026-10-02T10:00:00Z", "rm", 120000, 60000, 60000),
  exp("wifi", "2026-10-03T10:00:00Z", "rm", 80000, 40000, 40000),
  exp("item", "2026-10-04T10:00:00Z", "you", 60000, 30000, 30000),
];
const repay = (id, at, from, to, amountMinor, status = "confirmed") => ({ id, at, label: id, fromUserId: from, toUserId: to, amountMinor, status });
const explain = (expenses, settlements = [], memberIds = ids) => explainLedger({ expenses, settlements, memberIds });

describe("explainLedger", () => {
  it("reproduces the worked example: you +30000, roommate -30000", () => {
    const { net, members } = explain(worked);
    expect(net).toEqual({ you: 30000, rm: -30000 });
    expect(members.you).toEqual({ paidMinor: 260000, shareMinor: 230000, sentMinor: 0, receivedMinor: 0, netMinor: 30000 });
    expect(members.rm).toEqual({ paidMinor: 200000, shareMinor: 230000, sentMinor: 0, receivedMinor: 0, netMinor: -30000 });
  });

  it("the parts always satisfy Net = Paid - Share + Sent - Received", () => {
    const { members } = explain(worked, [repay("r1", "2026-10-05T10:00:00Z", "rm", "you", 20000)]);
    for (const m of Object.values(members)) {
      expect(m.netMinor).toBe(m.paidMinor - m.shareMinor + m.sentMinor - m.receivedMinor);
    }
    expect(members.rm).toMatchObject({ sentMinor: 20000, netMinor: -10000 });
    expect(members.you).toMatchObject({ receivedMinor: 20000, netMinor: 10000 });
  });

  it("lists entries oldest first with each member's running balance, ending at the net", () => {
    const { entries, net } = explain(worked);
    expect(entries.map((e) => e.id)).toEqual(["groceries", "electricity", "wifi", "item"]);
    expect(entries[0]).toMatchObject({ kind: "expense", counted: true, deltas: { you: 100000, rm: -100000 }, running: { you: 100000, rm: -100000 } });
    expect(entries[1].running).toEqual({ you: 40000, rm: -40000 });
    expect(entries.at(-1).running).toEqual(net);
  });

  it("orders ties by id, whatever order the rows arrive in", () => {
    const a = exp("b-second", "2026-10-01T10:00:00Z", "you", 100, 50, 50);
    const b = exp("a-first", "2026-10-01T10:00:00Z", "you", 100, 50, 50);
    expect(explain([a, b]).entries.map((e) => e.id)).toEqual(["a-first", "b-second"]);
    expect(explain([b, a]).entries.map((e) => e.id)).toEqual(["a-first", "b-second"]);
  });

  it("shows a repayment between the expenses it follows, and a flipped balance after an overpayment", () => {
    const { entries, net } = explain(worked, [repay("r1", "2026-10-05T10:00:00Z", "rm", "you", 40000)]);
    expect(entries.map((e) => e.kind)).toEqual(["expense", "expense", "expense", "expense", "repayment"]);
    expect(net).toEqual({ you: -10000, rm: 10000 });
  });

  it("lists reversed expenses and unconfirmed repayments but changes nothing for them", () => {
    const reversed = exp("oops", "2026-10-06T10:00:00Z", "you", 999900, 499950, 499950, { status: "reversed" });
    const settlements = ["pending", "rejected", "cancelled"].map((status, i) => repay(`r${i}`, "2026-10-07T10:00:00Z", "rm", "you", 5000, status));
    const { entries, net } = explain([...worked, reversed], settlements);
    for (const id of ["oops", "r0", "r1", "r2"]) {
      const entry = entries.find((e) => e.id === id);
      expect(entry.counted).toBe(false);
      expect(Object.values(entry.deltas).every((v) => v === 0)).toBe(true);
    }
    expect(net).toEqual({ you: 30000, rm: -30000 });
    expect(entries.find((e) => e.id === "oops").status).toBe("reversed");
  });

  it("subtracts refunds and lists them as refunds", () => {
    const original = exp("rent", "2026-10-01T10:00:00Z", "you", 100000, 50000, 50000);
    const refund = {
      id: "refund-1",
      at: "2026-10-02T10:00:00Z",
      label: "Refund: rent",
      paidBy: "you",
      amountMinor: 20000,
      type: "refund",
      status: "confirmed",
      splits: calculateRefundShares(original.splits, 20000, "r1"),
    };
    const { entries, net } = explain([original, refund]);
    expect(net).toEqual({ you: 40000, rm: -40000 });
    expect(entries[1]).toMatchObject({ kind: "refund", deltas: { you: -10000, rm: 10000 } });
  });

  it("leaves personal expenses out completely", () => {
    const personal = { id: "p", at: "2026-10-01T10:00:00Z", label: "Headphones", paidBy: "you", amountMinor: 150000, type: "personal", status: "confirmed", splits: [{ userId: "you", shareMinor: 150000 }] };
    const { entries, net, members } = explain([...worked, personal]);
    expect(entries.map((e) => e.id)).not.toContain("p");
    expect(net).toEqual({ you: 30000, rm: -30000 });
    expect(members.you.paidMinor).toBe(260000);
  });

  it("shares the validation of calculateMemberBalances", () => {
    expect(() => explain([exp("bad", "2026-10-01T10:00:00Z", "you", 100, 50, 40)])).toThrow(expect.objectContaining({ code: "SPLIT_MISMATCH" }));
    expect(() => explain([], [repay("self", "2026-10-01T10:00:00Z", "you", "you", 5)])).toThrow(expect.objectContaining({ code: "SELF_SETTLEMENT" }));
    expect(() => explain([exp("ghost", "2026-10-01T10:00:00Z", "ghost", 100, 50, 50)])).toThrow(expect.objectContaining({ code: "UNKNOWN_MEMBER" }));
  });

  it("copes with an empty household", () => {
    expect(explain([], [])).toEqual({ net: { you: 0, rm: 0 }, members: { you: { paidMinor: 0, shareMinor: 0, sentMinor: 0, receivedMinor: 0, netMinor: 0 }, rm: { paidMinor: 0, shareMinor: 0, sentMinor: 0, receivedMinor: 0, netMinor: 0 } }, entries: [] });
  });
});

describe("explainLedger properties", () => {
  const people = ["a", "b", "c"];
  const expenseArb = fc.record({
    payer: fc.constantFrom(...people),
    who: fc.subarray(people, { minLength: 1 }),
    amount: fc.integer({ min: 1, max: 10_000_000 }),
    seed: fc.string({ minLength: 1 }),
    minute: fc.integer({ min: 0, max: 5 }),
    status: fc.constantFrom("confirmed", "confirmed", "disputed", "reversed"),
  });
  const repaymentArb = fc.record({
    pair: fc.shuffledSubarray(people, { minLength: 2, maxLength: 2 }),
    amount: fc.integer({ min: 1, max: 10_000_000 }),
    minute: fc.integer({ min: 0, max: 5 }),
    status: fc.constantFrom("confirmed", "pending", "rejected", "cancelled"),
  });
  const minute = (m) => new Date(Date.UTC(2026, 9, 1, 10, m)).toISOString();

  it("agrees with calculateMemberBalances; every entry sums to zero; the last running balance is the net", () => {
    fc.assert(
      fc.property(fc.array(expenseArb, { maxLength: 12 }), fc.array(repaymentArb, { maxLength: 8 }), (es, rs) => {
        const expenses = es.map((x, i) => ({
          id: `e${i}`, at: minute(x.minute), label: `e${i}`, paidBy: x.payer, amountMinor: x.amount, type: "shared", status: x.status,
          splits: splitEqual(x.amount, x.who, x.seed),
        }));
        const settlements = rs.map((x, i) => repay(`r${i}`, minute(x.minute), x.pair[0], x.pair[1], x.amount, x.status));
        const result = explainLedger({ expenses, settlements, memberIds: people });

        expect(result.net).toEqual(calculateMemberBalances({ expenses, settlements, memberIds: people }));
        for (const entry of result.entries) expect(Object.values(entry.deltas).reduce((a, b) => a + b, 0)).toBe(0);
        if (result.entries.length > 0) expect(result.entries.at(-1).running).toEqual(result.net);
        for (const m of Object.values(result.members)) expect(m.netMinor).toBe(m.paidMinor - m.shareMinor + m.sentMinor - m.receivedMinor);
      }),
      { numRuns: 2000 },
    );
  });
});
