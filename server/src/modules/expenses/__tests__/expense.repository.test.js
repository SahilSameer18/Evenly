import { describe, it, expect } from "vitest";
import * as repository from "../expense.repository.js";

// The idempotency key is unique per user across all households, so this lookup cannot take a householdId.
const UNSCOPED = new Set(["findExpenseByIdempotencyKey"]);

describe("expense repository tenant scoping", () => {
  const scopedFunctions = Object.entries(repository).filter(([name]) => !UNSCOPED.has(name));

  it("checks the functions we expect", () => {
    expect(scopedFunctions.map(([name]) => name).sort()).toEqual([
      "categoryExists",
      "createExpense",
      "createRefund",
      "disputeExpense",
      "findExpenseById",
      "listActiveMemberIds",
      "listExpenses",
      "listHistory",
      "reverseExpense",
      "updateExpense",
      "withdrawDispute",
    ]);
  });

  // A new function must either require a householdId or be added to UNSCOPED on purpose.
  it.each(scopedFunctions)("%s refuses to run without a householdId", (name, fn) => {
    for (const bad of [undefined, null, ""]) {
      expect(() => fn(bad, "x", "y", {})).toThrow("householdId is required");
    }
  });
});
