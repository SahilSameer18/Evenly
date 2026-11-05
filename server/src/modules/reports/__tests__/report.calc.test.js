import { describe, it, expect } from "vitest";
import { addMonths, buildReport, monthOf } from "../report.calc.js";

const IST = "Asia/Kolkata";
const at = (iso) => new Date(iso);

describe("monthOf", () => {
  it("uses the wall clock of the timezone: 00:10 IST on 1 November is still October in UTC", () => {
    const instant = at("2026-10-31T18:40:00Z");
    expect(monthOf(instant, IST)).toBe("2026-11");
    expect(monthOf(instant, "UTC")).toBe("2026-10");
  });

  it("switches exactly at midnight local time", () => {
    expect(monthOf(at("2026-11-30T18:29:59Z"), IST)).toBe("2026-11");
    expect(monthOf(at("2026-11-30T18:30:00Z"), IST)).toBe("2026-12");
  });

  it("rolls the year over", () => {
    expect(monthOf(at("2026-12-31T19:00:00Z"), IST)).toBe("2027-01");
  });
});

describe("addMonths", () => {
  it("moves forward and back across year ends", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-11", -5)).toBe("2026-06");
    expect(addMonths("2026-11", 0)).toBe("2026-11");
  });
});

describe("buildReport", () => {
  const members = [
    { userId: "a", name: "Alice", active: true },
    { userId: "b", name: "Bob", active: true },
    { userId: "c", name: "Carol", active: false },
  ];
  const expense = (over) => ({
    type: "shared", status: "confirmed", paidById: "a", amountMinor: 1000, occurredAt: at("2026-11-10T06:00:00Z"),
    splits: [{ userId: "a", shareMinor: 500 }, { userId: "b", shareMinor: 500 }], ...over,
  });
  const report = (expenses, month = "2026-11") => buildReport({ expenses, members, month, timeZone: IST });

  it("totals the month and each person's paid and share", () => {
    const r = report([expense({}), expense({ paidById: "b", amountMinor: 600, splits: [{ userId: "a", shareMinor: 100 }, { userId: "b", shareMinor: 500 }] })]);
    expect(r.spendMinor).toBe(1600);
    expect(r.members.map((m) => [m.userId, m.paidMinor, m.shareMinor])).toEqual([["a", 1000, 600], ["b", 600, 1000]]);
  });

  it("leaves out personal and reversed expenses, but counts disputed ones", () => {
    const r = report([expense({ type: "personal" }), expense({ status: "reversed" }), expense({ status: "disputed", amountMinor: 400, splits: [{ userId: "a", shareMinor: 400 }] })]);
    expect(r.spendMinor).toBe(400);
  });

  it("subtracts a refund in the month it was recorded", () => {
    const r = report([expense({}), expense({ type: "refund", amountMinor: 300, splits: [{ userId: "a", shareMinor: 100 }, { userId: "b", shareMinor: 200 }] })]);
    expect(r.spendMinor).toBe(700);
    expect(r.members.find((m) => m.userId === "b").shareMinor).toBe(300);
  });

  it("puts an expense in the month of the household's clock, not UTC", () => {
    const r = report([expense({ occurredAt: at("2026-10-31T18:40:00Z") })]);
    expect(r.spendMinor).toBe(1000);
    expect(report([expense({ occurredAt: at("2026-10-31T18:40:00Z") })], "2026-10").spendMinor).toBe(0);
  });

  it("gives six months ending at the chosen one, empty months as 0, and the month before", () => {
    const r = report([expense({ occurredAt: at("2026-09-15T06:00:00Z"), amountMinor: 900, splits: [{ userId: "a", shareMinor: 900 }] }), expense({})]);
    expect(r.trend.map((t) => t.month)).toEqual(["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]);
    expect(r.trend.map((t) => t.spendMinor)).toEqual([0, 0, 0, 900, 0, 1000]);
    expect(r.previousSpendMinor).toBe(0);
    expect(report([expense({ occurredAt: at("2026-10-12T06:00:00Z") })]).previousSpendMinor).toBe(1000);
  });

  it("ignores expenses outside the six months", () => {
    expect(report([expense({ occurredAt: at("2025-01-10T06:00:00Z") })]).spendMinor).toBe(0);
  });

  it("shows someone who left only when they took part that month", () => {
    expect(report([expense({})]).members.map((m) => m.userId)).toEqual(["a", "b"]);
    const involved = report([expense({ amountMinor: 900, splits: [{ userId: "a", shareMinor: 300 }, { userId: "b", shareMinor: 300 }, { userId: "c", shareMinor: 300 }] })]);
    expect(involved.members.map((m) => m.userId)).toEqual(["a", "b", "c"]);
  });

  it("an empty month is all zeros, never an error", () => {
    const r = report([]);
    expect(r.spendMinor).toBe(0);
    expect(r.trend).toHaveLength(6);
    expect(r.members.every((m) => m.paidMinor === 0 && m.shareMinor === 0)).toBe(true);
  });
});
