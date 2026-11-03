// Tenant rule: every household-scoped repository function takes householdId first and cannot run without it.
export function scoped(householdId) {
  if (typeof householdId !== "string" || !householdId) throw new Error("householdId is required");
  return householdId;
}
