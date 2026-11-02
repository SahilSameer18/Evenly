import { describe, it, expect } from "vitest";
import { splitEqual, splitByBasisPoints, splitByWeights, splitExact } from "../split.js";

const amounts = (rows) => rows.map((r) => r.shareMinor);
const sorted = (rows) => amounts(rows).sort((a, b) => b - a);
const sum = (rows) => amounts(rows).reduce((a, b) => a + b, 0);
const code = (c) => expect.objectContaining({ code: c });

describe("splitEqual", () => {
  it("vector 1: 10000 among 3 -> 3334 / 3333 / 3333", () => {
    const r = splitEqual(10000, ["A", "B", "C"], "e1");
    expect(sorted(r)).toEqual([3334, 3333, 3333]);
    expect(sum(r)).toBe(10000);
  });

  it("vector 2: 100 among 3 -> 34 / 33 / 33", () => {
    expect(sorted(splitEqual(100, ["A", "B", "C"], "e1"))).toEqual([34, 33, 33]);
  });

  it("is deterministic and ignores input order", () => {
    const a = splitEqual(100, ["A", "B", "C"], "e1");
    expect(splitEqual(100, ["C", "A", "B"], "e1")).toEqual(a);
    expect(splitEqual(100, ["A", "B", "C"], "e1")).toEqual(a);
  });

  it("spreads the extra paisa across people over many expenses", () => {
    const extra = { A: 0, B: 0, C: 0 };
    for (let i = 0; i < 300; i++) {
      for (const r of splitEqual(100, ["A", "B", "C"], `expense-${i}`)) {
        if (r.shareMinor === 34) extra[r.userId] += 1;
      }
    }
    expect(Math.min(...Object.values(extra))).toBeGreaterThan(60);
  });

  it("handles zero total and a single person", () => {
    expect(amounts(splitEqual(0, ["A", "B"], "e"))).toEqual([0, 0]);
    expect(splitEqual(777, ["A"], "e")).toEqual([{ userId: "A", shareMinor: 777 }]);
  });

  it("rejects empty and duplicate people", () => {
    expect(() => splitEqual(100, [], "e")).toThrow(code("SPLIT_EMPTY"));
    expect(() => splitEqual(100, ["A", "A"], "e")).toThrow(code("SPLIT_DUPLICATE_USER"));
  });

  it("rejects bad totals and a missing seed", () => {
    for (const bad of [-1, 1.5, NaN]) {
      expect(() => splitEqual(bad, ["A"], "e")).toThrow(code("INVALID_AMOUNT"));
    }
    expect(() => splitEqual(100, ["A"], "")).toThrow(code("SPLIT_SEED_REQUIRED"));
  });
});

describe("splitByBasisPoints", () => {
  it("vector 3: 10001 at 60/40 -> A 6001, B 4000", () => {
    const r = splitByBasisPoints(10001, [{ userId: "A", bps: 6000 }, { userId: "B", bps: 4000 }], "e");
    expect(r).toEqual([{ userId: "A", shareMinor: 6001 }, { userId: "B", shareMinor: 4000 }]);
  });

  it("rejects bps that do not total 10000", () => {
    expect(() => splitByBasisPoints(100, [{ userId: "A", bps: 5000 }], "e")).toThrow(code("BPS_SUM_INVALID"));
  });
});

describe("splitByWeights", () => {
  it("2:1:1 on 10001 -> 5001 / 2500 / 2500", () => {
    const parts = [{ userId: "A", weight: 2 }, { userId: "B", weight: 1 }, { userId: "C", weight: 1 }];
    expect(amounts(splitByWeights(10001, parts, "e"))).toEqual([5001, 2500, 2500]);
  });

  it("rejects zero, negative and fractional weights", () => {
    for (const weight of [0, -1, 1.5]) {
      expect(() => splitByWeights(100, [{ userId: "A", weight }], "e")).toThrow(code("SPLIT_INVALID_WEIGHT"));
    }
  });

  it("rejects totals that would overflow safe integers", () => {
    expect(() => splitByWeights(Number.MAX_SAFE_INTEGER, [{ userId: "A", weight: 2 }], "e")).toThrow(
      code("INVALID_AMOUNT"),
    );
  });
});

describe("splitExact", () => {
  it("accepts shares that add up", () => {
    const r = splitExact(1000, [{ userId: "B", shareMinor: 300 }, { userId: "A", shareMinor: 700 }]);
    expect(amounts(r)).toEqual([700, 300]);
  });

  it("vector 13: rejects shares not summing to the total", () => {
    expect(() => splitExact(1000, [{ userId: "A", shareMinor: 700 }, { userId: "B", shareMinor: 200 }])).toThrow(
      code("SPLIT_MISMATCH"),
    );
  });

  it("rejects negative shares", () => {
    expect(() => splitExact(0, [{ userId: "A", shareMinor: 5 }, { userId: "B", shareMinor: -5 }])).toThrow(
      code("SPLIT_INVALID_SHARE"),
    );
  });
});
