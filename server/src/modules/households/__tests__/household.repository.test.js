import { describe, it, expect } from "vitest";
import * as repository from "../household.repository.js";

// These cannot take a householdId: they act on a user, before any household is known.
const UNSCOPED = new Set(["createHousehold", "listHouseholdsForUser"]);

describe("household repository tenant scoping", () => {
  const scopedFunctions = Object.entries(repository).filter(([name]) => !UNSCOPED.has(name));

  it("has scoped functions to check", () => {
    expect(scopedFunctions.map(([name]) => name)).toEqual(["findActiveMembership", "getHousehold"]);
  });

  // A new function must either require a householdId or be added to UNSCOPED on purpose.
  it.each(scopedFunctions)("%s refuses to run without a householdId", (name, fn) => {
    for (const bad of [undefined, null, ""]) {
      expect(() => fn(bad, "x")).toThrow("householdId is required");
    }
  });
});
