import { describe, it, expect, afterEach, vi } from "vitest";
import { createExpenseBody, listExpensesQuery } from "../expense.validation.js";

const shared = { type: "shared", description: "Groceries", amountMinor: 10000, split: { method: "equal", participants: ["a", "b"] } };
const fields = (result) => (result.success ? [] : result.error.issues.map((i) => i.path.join(".") || (i.keys ?? []).join(",")));

describe("createExpenseBody", () => {
  afterEach(() => vi.useRealTimers());

  it.each([
    ["shared equal", shared],
    ["shared exact", { ...shared, split: { method: "exact", shares: [{ userId: "a", shareMinor: 6000 }, { userId: "b", shareMinor: 4000 }] } }],
    ["shared percentage", { ...shared, split: { method: "percentage", parts: [{ userId: "a", bps: 6000 }, { userId: "b", bps: 4000 }] } }],
    ["shared weights", { ...shared, split: { method: "weights", parts: [{ userId: "a", weight: 2 }, { userId: "b", weight: 1 }] } }],
    ["personal", { type: "personal", description: "Headphones", amountMinor: 150000 }],
    ["on behalf", { type: "on_behalf", description: "Medicine", amountMinor: 60000, beneficiaryId: "b" }],
  ])("accepts %s", (_label, body) => {
    expect(createExpenseBody.safeParse(body).success).toBe(true);
  });

  it("trims text and turns occurredAt into a Date at the right instant", () => {
    const parsed = createExpenseBody.parse({ ...shared, description: "  Rent ", occurredAt: "2026-10-30T14:20:00+05:30" });
    expect(parsed.description).toBe("Rent");
    expect(parsed.occurredAt.toISOString()).toBe("2026-10-30T08:50:00.000Z");
  });

  it.each([
    ["no type", (b) => ({ ...b, type: undefined }), "type"],
    ["an unknown type", (b) => ({ ...b, type: "gift" }), "type"],
    ["a zero amount", (b) => ({ ...b, amountMinor: 0 }), "amountMinor"],
    ["a negative amount", (b) => ({ ...b, amountMinor: -5 }), "amountMinor"],
    ["a fractional amount", (b) => ({ ...b, amountMinor: 10.5 }), "amountMinor"],
    ["an amount over the cap", (b) => ({ ...b, amountMinor: 1_000_000_001 }), "amountMinor"],
    ["an amount sent as text", (b) => ({ ...b, amountMinor: "100" }), "amountMinor"],
    ["a blank description", (b) => ({ ...b, description: "   " }), "description"],
    ["a 141-character description", (b) => ({ ...b, description: "x".repeat(141) }), "description"],
    ["a date that is not ISO", (b) => ({ ...b, occurredAt: "yesterday" }), "occurredAt"],
    ["a date without an offset", (b) => ({ ...b, occurredAt: "2026-10-30T14:20:00" }), "occurredAt"],
    ["an unknown field", (b) => ({ ...b, status: "reversed" }), "status"],
    ["a shared expense with no split", (b) => ({ ...b, split: undefined }), "split"],
    ["no participants", (b) => ({ ...b, split: { method: "equal", participants: [] } }), "split.participants"],
    ["an unknown split method", (b) => ({ ...b, split: { method: "random" } }), "split.method"],
    ["a negative share", (b) => ({ ...b, split: { method: "exact", shares: [{ userId: "a", shareMinor: -1 }] } }), "split.shares.0.shareMinor"],
    ["bps over 10000", (b) => ({ ...b, split: { method: "percentage", parts: [{ userId: "a", bps: 10001 }] } }), "split.parts.0.bps"],
    ["an unknown field inside the split", (b) => ({ ...b, split: { method: "equal", participants: ["a"], extra: 1 } }), "split"],
  ])("rejects %s", (_label, change, field) => {
    expect(fields(createExpenseBody.safeParse(change(shared)))).toContain(field);
  });

  it("rejects the wrong shape for personal and on_behalf", () => {
    expect(fields(createExpenseBody.safeParse({ type: "personal", description: "x", amountMinor: 1, split: shared.split }))).toContain("split");
    expect(fields(createExpenseBody.safeParse({ type: "personal", description: "x", amountMinor: 1, paidById: "a" }))).toContain("paidById");
    expect(fields(createExpenseBody.safeParse({ type: "on_behalf", description: "x", amountMinor: 1 }))).toContain("beneficiaryId");
    expect(fields(createExpenseBody.safeParse({ type: "on_behalf", description: "x", amountMinor: 1, beneficiaryId: "b", split: shared.split }))).toContain("split");
  });

  it("checks the future on every call, not once when the module loads", () => {
    vi.useFakeTimers();
    const tenMinutesAhead = "2026-01-01T00:10:00Z";
    const fourMinutesAhead = "2026-01-01T00:04:00Z";

    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    expect(createExpenseBody.safeParse({ ...shared, occurredAt: tenMinutesAhead }).success).toBe(false);
    expect(createExpenseBody.safeParse({ ...shared, occurredAt: fourMinutesAhead }).success).toBe(true);

    vi.setSystemTime(new Date("2026-06-01T00:00:00Z")); // the clock moved on: the same date is now the past
    expect(createExpenseBody.safeParse({ ...shared, occurredAt: tenMinutesAhead }).success).toBe(true);
  });
});

describe("listExpensesQuery", () => {
  it("applies the default limit and parses dates", () => {
    const parsed = listExpensesQuery.parse({ from: "2026-11-01T00:00:00Z" });
    expect(parsed.limit).toBe(25);
    expect(parsed.from).toBeInstanceOf(Date);
  });

  it("converts the limit from text", () => {
    expect(listExpensesQuery.parse({ limit: "50" }).limit).toBe(50);
  });

  it.each([
    ["limit 0", { limit: "0" }, "limit"],
    ["limit 101", { limit: "101" }, "limit"],
    ["a limit that is not a number", { limit: "abc" }, "limit"],
    ["a fractional limit", { limit: "2.5" }, "limit"],
    ["an unknown parameter", { sort: "asc" }, "sort"],
    ["a bad date", { from: "last week" }, "from"],
    ["a bad type", { type: "gift" }, "type"],
    ["a bad status", { status: "gone" }, "status"],
    ["an empty search", { q: "   " }, "q"],
  ])("rejects %s", (_label, query, field) => {
    expect(fields(listExpensesQuery.safeParse(query))).toContain(field);
  });
});
