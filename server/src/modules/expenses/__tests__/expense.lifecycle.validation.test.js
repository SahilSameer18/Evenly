import { describe, it, expect } from "vitest";
import { listExpensesQuery, reasonBody, refundBody, updateExpenseBody } from "../expense.validation.js";

const fields = (result) => (result.success ? [] : result.error.issues.map((i) => i.path.join(".") || (i.keys ?? []).join(",")));
const shared = { type: "shared", version: 1, description: "Rent", amountMinor: 10000, split: { method: "equal", participants: ["a", "b"] } };

describe("updateExpenseBody", () => {
  it.each([
    ["shared", shared],
    ["personal", { type: "personal", version: 3, description: "Headphones", amountMinor: 5000 }],
    ["on behalf", { type: "on_behalf", version: 2, description: "Medicine", amountMinor: 600, beneficiaryId: "b" }],
  ])("accepts %s with a version", (_label, body) => {
    expect(updateExpenseBody.safeParse(body).success).toBe(true);
  });

  it.each([
    ["no version", { ...shared, version: undefined }, "version"],
    ["version 0", { ...shared, version: 0 }, "version"],
    ["a fractional version", { ...shared, version: 1.5 }, "version"],
    ["a version sent as text", { ...shared, version: "1" }, "version"],
    ["an unknown field", { ...shared, status: "reversed" }, "status"],
    ["a shared edit with no split", { ...shared, split: undefined }, "split"],
    ["a zero amount", { ...shared, amountMinor: 0 }, "amountMinor"],
  ])("rejects %s", (_label, body, field) => {
    expect(fields(updateExpenseBody.safeParse(body))).toContain(field);
  });

  it("keeps the strictness of the create shapes for personal expenses", () => {
    const result = updateExpenseBody.safeParse({ type: "personal", version: 1, description: "x", amountMinor: 1, paidById: "a" });
    expect(fields(result)).toContain("paidById");
  });
});

describe("reasonBody", () => {
  it("trims the reason", () => {
    expect(reasonBody.parse({ reason: "  entered twice " })).toEqual({ reason: "entered twice" });
  });

  it.each([
    ["no reason", {}],
    ["a blank reason", { reason: "   " }],
    ["a reason over 300 characters", { reason: "x".repeat(301) }],
    ["an unknown field", { reason: "ok", extra: 1 }],
  ])("rejects %s", (_label, body) => {
    expect(reasonBody.safeParse(body).success).toBe(false);
  });
});

describe("refundBody", () => {
  it("accepts an amount alone, or with notes and a date", () => {
    expect(refundBody.safeParse({ amountMinor: 500 }).success).toBe(true);
    expect(refundBody.safeParse({ amountMinor: 500, notes: "store credit", occurredAt: "2026-10-30T14:20:00+05:30" }).success).toBe(true);
  });

  it.each([
    ["a zero amount", { amountMinor: 0 }, "amountMinor"],
    ["a negative amount", { amountMinor: -1 }, "amountMinor"],
    ["a fractional amount", { amountMinor: 1.5 }, "amountMinor"],
    ["no amount", {}, "amountMinor"],
    ["an unknown field", { amountMinor: 1, refundOfId: "x" }, "refundOfId"],
    ["a date in the future", { amountMinor: 1, occurredAt: new Date(Date.now() + 86_400_000).toISOString() }, "occurredAt"],
  ])("rejects %s", (_label, body, field) => {
    expect(fields(refundBody.safeParse(body))).toContain(field);
  });
});

describe("listExpensesQuery", () => {
  it("accepts refund as a type filter", () => {
    expect(listExpensesQuery.safeParse({ type: "refund" }).success).toBe(true);
  });
});
