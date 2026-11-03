import { describe, it, expect } from "vitest";
import { decodeCursor, encodeCursor } from "../cursor.js";

describe("cursor", () => {
  it("round-trips the sort position", () => {
    const position = { occurredAt: new Date("2026-11-03T10:00:00.000Z"), id: "abc-123" };
    const decoded = decodeCursor(encodeCursor(position));
    expect(decoded.id).toBe("abc-123");
    expect(decoded.occurredAt.toISOString()).toBe("2026-11-03T10:00:00.000Z");
  });

  it("is URL safe", () => {
    expect(encodeCursor({ occurredAt: new Date(), id: "a/b+c" })).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  const b64 = (value) => Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");

  it.each([
    ["garbage", "not-a-cursor!!"],
    ["not JSON", b64("hello")],
    ["no id", b64({ t: "2026-11-03T00:00:00.000Z" })],
    ["id of the wrong type", b64({ t: "2026-11-03T00:00:00.000Z", id: 5 })],
    ["an empty id", b64({ t: "2026-11-03T00:00:00.000Z", id: "" })],
    ["a bad date", b64({ t: "yesterday", id: "x" })],
    ["an oversized id", b64({ t: "2026-11-03T00:00:00.000Z", id: "x".repeat(65) })],
    ["null", b64("null")],
  ])("rejects %s", (_label, cursor) => {
    expect(decodeCursor(cursor)).toBeNull();
  });
});
