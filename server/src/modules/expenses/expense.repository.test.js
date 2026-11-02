import { describe, it, expect } from "vitest";
import * as repository from "./expense.repository.js";

describe("expense repository tenant scoping", () => {
  it.each(Object.entries(repository))("%s refuses to run without a householdId", (name, fn) => {
    for (const bad of [undefined, null, ""]) {
      expect(() => fn(bad, "some-id")).toThrow("householdId is required");
    }
  });
});
