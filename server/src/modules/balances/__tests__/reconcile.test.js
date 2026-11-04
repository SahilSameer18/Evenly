import { describe, it, expect, vi } from "vitest";

vi.mock("../balance.repository.js", () => ({ loadLedger: vi.fn() }));

const { checkBalances, reconcile, toLedgerInput } = await import("../balance.service.js");
const repository = await import("../balance.repository.js");

const expense = (over = {}) => ({
  id: "e1",
  at: "2026-10-01T10:00:00Z",
  label: "Rent",
  paidBy: "a",
  amountMinor: 1000,
  type: "shared",
  status: "confirmed",
  splits: [{ userId: "a", shareMinor: 500 }, { userId: "b", shareMinor: 500 }],
  ...over,
});
const context = () => ({ log: { error: vi.fn() }, requestId: "req-1", householdId: "h-1" });

describe("checkBalances (the runtime check)", () => {
  it("returns the balances and logs nothing when the books add up", () => {
    const ctx = context();
    expect(checkBalances({ memberIds: ["a", "b"], expenses: [expense()], settlements: [] }, ctx)).toEqual({ a: 500, b: -500 });
    expect(ctx.log.error).not.toHaveBeenCalled();
  });

  it.each([
    ["splits that do not add up to the amount", { expenses: [expense({ amountMinor: 1001 })], settlements: [] }, "SPLIT_MISMATCH"],
    ["an expense paid by someone who is not a member", { expenses: [expense({ paidBy: "ghost" })], settlements: [] }, "UNKNOWN_MEMBER"],
    ["a repayment to yourself", { expenses: [], settlements: [{ id: "s", fromUserId: "a", toUserId: "a", amountMinor: 5, status: "confirmed" }] }, "SELF_SETTLEMENT"],
  ])("logs an error with the request id and code for %s, and returns null", (_label, rest, code) => {
    const ctx = context();
    expect(checkBalances({ memberIds: ["a", "b"], ...rest }, ctx)).toBeNull();
    expect(ctx.log.error).toHaveBeenCalledWith({ requestId: "req-1", householdId: "h-1", code }, "balances do not reconcile");
  });

  it("does not swallow a bug that is not a ledger problem", () => {
    expect(() => checkBalances(null, context())).toThrow(TypeError);
  });
});

describe("reconcile", () => {
  it("never throws when the database fails: it logs and returns null", async () => {
    repository.loadLedger.mockRejectedValue(new Error("connection reset"));
    const log = { error: vi.fn() };
    await expect(reconcile({ householdId: "h-1", log, requestId: "req-2" })).resolves.toBeNull();
    expect(log.error).toHaveBeenCalledWith({ requestId: "req-2", householdId: "h-1", err: "connection reset" }, "balance check could not run");
  });

  it("returns the balances after a normal load", async () => {
    repository.loadLedger.mockResolvedValue({
      expenses: [{ id: "e1", occurredAt: new Date(), description: "Rent", paidById: "a", amountMinor: 1000, type: "shared", status: "confirmed", splits: [{ userId: "a", shareMinor: 500 }, { userId: "b", shareMinor: 500 }] }],
      settlements: [],
      members: [{ userId: "a", status: "active" }, { userId: "b", status: "active" }],
    });
    await expect(reconcile({ householdId: "h-1", log: { error: vi.fn() }, requestId: "r" })).resolves.toEqual({ a: 500, b: -500 });
  });
});

describe("toLedgerInput", () => {
  it("maps database rows to what the ledger takes, ordering repayments by when they took effect", () => {
    const confirmedAt = new Date("2026-10-05T00:00:00Z");
    const initiatedAt = new Date("2026-10-04T00:00:00Z");
    const input = toLedgerInput({
      members: [{ userId: "a" }, { userId: "b" }],
      expenses: [{ id: "e", occurredAt: confirmedAt, description: "Rent", paidById: "a", amountMinor: 10, type: "refund", status: "confirmed", splits: [{ userId: "b", shareMinor: 10, extra: "x" }] }],
      settlements: [
        { id: "s1", status: "confirmed", confirmedAt, initiatedAt, method: "upi", fromUserId: "b", toUserId: "a", amountMinor: 5 },
        { id: "s2", status: "pending", confirmedAt: null, initiatedAt, method: "cash", fromUserId: "b", toUserId: "a", amountMinor: 5 },
      ],
    });
    expect(input.memberIds).toEqual(["a", "b"]);
    expect(input.expenses[0]).toEqual({ id: "e", at: confirmedAt, label: "Rent", paidBy: "a", amountMinor: 10, type: "refund", status: "confirmed", splits: [{ userId: "b", shareMinor: 10 }] });
    expect(input.settlements.map((s) => [s.id, s.at, s.label])).toEqual([["s1", confirmedAt, "Repayment (upi)"], ["s2", initiatedAt, "Repayment (cash)"]]);
  });
});
