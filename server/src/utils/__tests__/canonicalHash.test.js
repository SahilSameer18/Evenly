import { describe, it, expect } from "vitest";
import { canonicalJson, hashRequest } from "../canonicalHash.js";

describe("canonicalJson", () => {
  it("does not depend on key order, at any depth", () => {
    expect(canonicalJson({ b: 1, a: { d: [1, 2], c: "x" } })).toBe(canonicalJson({ a: { c: "x", d: [1, 2] }, b: 1 }));
  });

  it("ignores undefined fields, like JSON does", () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe(canonicalJson({ a: 1 }));
  });

  it("writes dates as ISO strings", () => {
    expect(canonicalJson({ t: new Date("2026-11-03T00:00:00Z") })).toBe('{"t":"2026-11-03T00:00:00.000Z"}');
  });

  it("keeps array order, since a different order is a different request", () => {
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });
});

describe("hashRequest", () => {
  it("is a 64-character hex SHA-256", () => {
    expect(hashRequest({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is the same for the same data and different for different data", () => {
    expect(hashRequest({ householdId: "h", body: { amount: 100, note: "x" } })).toBe(
      hashRequest({ body: { note: "x", amount: 100 }, householdId: "h" }),
    );
    expect(hashRequest({ amount: 100 })).not.toBe(hashRequest({ amount: 101 }));
    expect(hashRequest({ householdId: "h1", body: {} })).not.toBe(hashRequest({ householdId: "h2", body: {} }));
  });
});
