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
