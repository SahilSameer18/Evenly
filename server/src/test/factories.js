import { randomUUID } from "node:crypto";
import { signAccessToken } from "../lib/tokens.js";
import { testDb } from "./db-helper.js";

// Real rows in the test database. Users get an access token directly, so tests skip the slow password hashing.
export async function makeUser(name = "User", email = `${name.toLowerCase()}-${randomUUID().slice(0, 8)}@example.com`) {
  const user = await testDb.user.create({ data: { email, name, passwordHash: "!test-no-login" } });
  return { ...user, token: await signAccessToken(user.id) };
}

export const bearer = (user) => ({ Authorization: `Bearer ${user.token}` });

export function makeHousehold(owner, name = "Flat 302") {
  return testDb.household.create({ data: { name, members: { create: { userId: owner.id, role: "owner" } } } });
}

export function addMember(household, user, role = "member") {
  return testDb.householdMember.create({ data: { householdId: household.id, userId: user.id, role } });
}

/** An expense paid by `payer`, split by `shares` ({ userId: paise }). The splits must add up (the database checks). */
export function addExpense(household, payer, amountMinor, shares, type = "shared") {
  return testDb.expense.create({
    data: {
      householdId: household.id,
      createdById: payer.id,
      paidById: payer.id,
      description: "Test expense",
      amountMinor,
      type,
      splitMethod: "exact",
      occurredAt: new Date(),
      splits: { create: Object.entries(shares).map(([userId, shareMinor]) => ({ householdId: household.id, userId, shareMinor })) },
    },
  });
}

export function addRepayment(household, from, to, amountMinor, status = "confirmed") {
  return testDb.settlement.create({
    data: { householdId: household.id, fromUserId: from.id, toUserId: to.id, createdById: from.id, amountMinor, method: "cash", status },
  });
}
