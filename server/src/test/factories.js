import { randomUUID } from "node:crypto";
import { signAccessToken } from "../lib/tokens.js";
import { calculateMemberBalances } from "../ledger/index.js";
import { testDb } from "./db-helper.js";

// Real rows in the test database. Users get an access token directly, so tests skip the slow password hashing.
export async function makeUser(name = "User", email = `${name.toLowerCase()}-${randomUUID().slice(0, 8)}@example.com`) {
  const user = await testDb.user.create({ data: { email, name, passwordHash: "!test-no-login" } });
  return { ...user, token: await signAccessToken(user.id) };
}

/**
 * The usual cast in ONE database round trip (the remote test database makes every call cost about 80 ms,
 * and a transaction about 400 ms, so building people one by one dominated the run time).
 * people[0] owns a new household, the next (members - 1) people are active members of it, and anyone after
 * that is a stranger. A person is "Name" or { name, email }. Returns { users, household }; each user carries a token.
 * It writes with plain SQL, so the test in __tests__/factories.db.test.js fails if the schema drifts from it.
 */
export async function makeWorld(people = ["Alice", "Bob", "Carol"], { members = 2 } = {}) {
  if (members < 1 || members > people.length) throw new Error("makeWorld: members must be between 1 and the number of people");
  const users = people.map((p) => {
    const { name, email } = typeof p === "string" ? { name: p } : p;
    const id = randomUUID();
    return { id, name, email: email ?? `${name.toLowerCase()}-${id.slice(0, 8)}@example.com`, passwordHash: "!test-no-login" };
  });
  const household = { id: randomUUID(), name: "Flat 302" };

  const params = [];
  const p = (value) => `$${params.push(value)}`;
  const userRows = users.map((u) => `(${p(u.id)}, ${p(u.email)}, ${p(u.name)}, ${p(u.passwordHash)}, now())`).join(", ");
  // joinedAt comes from this computer's clock, like every join the app makes. Letting the database stamp it
  // would mix two clocks, and a small difference between them can put the owner "after" a later joiner.
  const start = Date.now();
  const memberRows = users
    .slice(0, members)
    .map((u, i) => `(${p(randomUUID())}, ${p(household.id)}, ${p(u.id)}, ${p(i === 0 ? "owner" : "member")}::"MemberRole", ${p(new Date(start + i))})`)
    .join(", ");
  // Data-modifying CTEs all run in one statement, and the foreign keys are checked when it ends.
  await testDb.$executeRawUnsafe(
    `WITH u AS (INSERT INTO "User" ("id", "email", "name", "passwordHash", "updatedAt") VALUES ${userRows}),
          h AS (INSERT INTO "Household" ("id", "name") VALUES (${p(household.id)}, ${p(household.name)}))
     INSERT INTO "HouseholdMember" ("id", "householdId", "userId", "role", "joinedAt") VALUES ${memberRows}`,
    ...params,
  );

  const withTokens = await Promise.all(users.map(async (u) => ({ ...u, token: await signAccessToken(u.id) })));
  return { users: withTokens, household };
}

export const bearer = (user) => ({ Authorization: `Bearer ${user.token}` });

export function makeHousehold(owner, name = "Flat 302") {
  return testDb.household.create({ data: { name, members: { create: { userId: owner.id, role: "owner" } } } });
}

export function addMember(household, user, role = "member") {
  return testDb.householdMember.create({ data: { householdId: household.id, userId: user.id, role } });
}

/** An expense paid by `payer`, split by `shares` ({ userId: paise }). The splits must add up (the database checks). */
export function addExpense(household, payer, amountMinor, shares, type = "shared", extra = {}) {
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
      ...extra, // description, occurredAt, categoryId, notes, status, idempotencyKey, requestHash
      splits: { create: Object.entries(shares).map(([userId, shareMinor]) => ({ householdId: household.id, userId, shareMinor })) },
    },
  });
}

/** Net balances worked out by the real ledger from the stored rows, so tests check what a user would see. */
export async function balancesOf(household, users) {
  const [expenses, settlements] = await Promise.all([
    testDb.expense.findMany({ where: { householdId: household.id }, include: { splits: true } }),
    testDb.settlement.findMany({ where: { householdId: household.id } }),
  ]);
  return calculateMemberBalances({
    memberIds: users.map((u) => u.id),
    expenses: expenses.map((e) => ({
      paidBy: e.paidById,
      amountMinor: e.amountMinor,
      type: e.type,
      status: e.status,
      splits: e.splits.map((s) => ({ userId: s.userId, shareMinor: s.shareMinor })),
    })),
    settlements: settlements.map((t) => ({ fromUserId: t.fromUserId, toUserId: t.toUserId, amountMinor: t.amountMinor, status: t.status })),
  });
}

export function addRepayment(household, from, to, amountMinor, status = "confirmed") {
  return testDb.settlement.create({
    data: { householdId: household.id, fromUserId: from.id, toUserId: to.id, createdById: from.id, amountMinor, method: "cash", status },
  });
}
