import { describe, it, expect } from "vitest";
import { toMinor, formatMoney } from "../money.js";

const invalid = expect.objectContaining({ code: "INVALID_AMOUNT" });

describe("toMinor", () => {
  it.each([
    ["1,250.5", 125050],
    ["1,000", 100000],
    ["0.1", 10],
    [".50", 50],
    ["5", 500],
    ["  12.34 ", 1234],
    ["0", 0],
  ])("parses %s", (input, expected) => {
    expect(toMinor(input)).toBe(expected);
  });

  it.each(["", " ", "-5", "1e3", "1.234", "abc", "5.", ".", "1.2.3", "Rs5"])("rejects %j", (input) => {
    expect(() => toMinor(input)).toThrow(invalid);
  });

  it("rejects numbers so floats never enter", () => {
    expect(() => toMinor(1250.5)).toThrow(invalid);
  });

  it("rejects amounts beyond safe integers", () => {
    expect(() => toMinor("99999999999999999999")).toThrow(invalid);
  });
});

describe("formatMoney", () => {
  it("formats with Indian grouping", () => {
    expect(formatMoney(12345600).replace(/\s/g, "")).toContain("1,23,456.00");
  });
});
