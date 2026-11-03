import { describe, it, expect } from "vitest";
import * as repository from "../household.repository.js";

// These cannot take a householdId: they act on a user, or find an invitation before its accepter is a member.
const UNSCOPED = new Set(["createHousehold", "listHouseholdsForUser", "findInvitationByTokenHash", "findUserEmail"]);

describe("household repository tenant scoping", () => {
  const scopedFunctions = Object.entries(repository).filter(([name]) => !UNSCOPED.has(name));

  it("checks the functions we expect", () => {
    expect(scopedFunctions.map(([name]) => name).sort()).toEqual([
      "acceptInvitation",
      "countPendingInvitations",
      "createInvitation",
      "findActiveMembership",
      "getHousehold",
    ]);
  });

  // A new function must either require a householdId or be added to UNSCOPED on purpose.
  it.each(scopedFunctions)("%s refuses to run without a householdId", (name, fn) => {
    for (const bad of [undefined, null, ""]) {
      expect(() => fn(bad, "x", "y")).toThrow("householdId is required");
    }
  });
});
