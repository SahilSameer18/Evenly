import { describe, it, expect } from "vitest";
import { createSettlementBody, listSettlementsQuery, rejectBody } from "../settlement.validation.js";

const fields = (result) => (result.success ? [] : result.error.issues.map((i) => i.path.join(".") || (i.keys ?? []).join(",")));
const valid = { toUserId: "bob", amountMinor: 20000, method: "upi" };

describe("createSettlementBody", () => {
  it.each(["cash", "upi", "bank", "other"])("accepts the %s method", (method) => {
    expect(createSettlementBody.safeParse({ ...valid, method }).success).toBe(true);
  });

  it("trims the optional reference and note", () => {
    const parsed = createSettlementBody.parse({ ...valid, paymentReference: "  UPI-123 ", note: " part of rent " });
    expect(parsed).toMatchObject({ paymentReference: "UPI-123", note: "part of rent" });
  });

  it.each([
    ["no recipient", { toUserId: undefined }, "toUserId"],
    ["no amount", { amountMinor: undefined }, "amountMinor"],
    ["a zero amount", { amountMinor: 0 }, "amountMinor"],
    ["a negative amount", { amountMinor: -1 }, "amountMinor"],
    ["a fractional amount", { amountMinor: 10.5 }, "amountMinor"],
    ["an amount over the cap", { amountMinor: 1_000_000_001 }, "amountMinor"],
    ["an amount sent as text", { amountMinor: "100" }, "amountMinor"],
    ["an unknown method", { method: "cheque" }, "method"],
    ["no method", { method: undefined }, "method"],
    ["a reference over 100 characters", { paymentReference: "x".repeat(101) }, "paymentReference"],
    ["a note over 300 characters", { note: "x".repeat(301) }, "note"],
    ["a blank note", { note: "   " }, "note"],
    ["an unknown field", { status: "confirmed" }, "status"],
    ["a sender (the sender is always you)", { fromUserId: "alice" }, "fromUserId"],
  ])("rejects %s", (_label, change, field) => {
    expect(fields(createSettlementBody.safeParse({ ...valid, ...change }))).toContain(field);
  });
});

describe("rejectBody", () => {
  it("is optional, and trims a reason", () => {
    expect(rejectBody.parse(undefined)).toEqual({});
    expect(rejectBody.parse({ reason: "  not received " })).toEqual({ reason: "not received" });
  });

  it.each([
    ["a blank reason", { reason: "  " }],
    ["a long reason", { reason: "x".repeat(301) }],
    ["an unknown field", { reason: "ok", status: "x" }],
  ])("rejects %s", (_label, body) => {
    expect(rejectBody.safeParse(body).success).toBe(false);
  });
});

describe("listSettlementsQuery", () => {
  it("defaults the limit and accepts a status", () => {
    expect(listSettlementsQuery.parse({}).limit).toBe(25);
    expect(listSettlementsQuery.parse({ status: "pending", limit: "5" })).toMatchObject({ status: "pending", limit: 5 });
  });

  it.each([
    ["limit 0", { limit: "0" }, "limit"],
    ["limit 101", { limit: "101" }, "limit"],
    ["a bad status", { status: "gone" }, "status"],
    ["an unknown parameter", { sort: "asc" }, "sort"],
  ])("rejects %s", (_label, query, field) => {
    expect(fields(listSettlementsQuery.safeParse(query))).toContain(field);
  });
});
