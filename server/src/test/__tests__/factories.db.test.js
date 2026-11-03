import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";

// Real database. Skipped without TEST_DATABASE_URL.
// makeWorld writes with plain SQL, so this test is what notices if the schema moves away from it.
describe.skipIf(!process.env.TEST_DATABASE_URL)("makeWorld test fixture", () => {
  let app, resetDb, testDb, f;

  beforeAll(async () => {
    ({ default: app } = await import("../../app.js"));
    ({ resetDb, testDb } = await import("../db-helper.js"));
    f = await import("../factories.js");
  });
  beforeEach(() => resetDb());

  it("builds the usual cast: an owner, a member and a stranger", async () => {
    const { users, household } = await f.makeWorld();
    const [alice, bob] = users;

    expect(users.map((u) => u.name)).toEqual(["Alice", "Bob", "Carol"]);
    expect(new Set(users.map((u) => u.email)).size).toBe(3);
    expect(await testDb.user.count()).toBe(3);
    expect(await testDb.household.count()).toBe(1);

    const rows = await testDb.householdMember.findMany({ where: { householdId: household.id } });
    const roleByUser = Object.fromEntries(rows.map((r) => [r.userId, `${r.role}/${r.status}`]));
    expect(roleByUser).toEqual({ [alice.id]: "owner/active", [bob.id]: "member/active" }); // carol is in neither
  });

  it("gives every person a working access token", async () => {
    const { users } = await f.makeWorld();
    for (const user of users) {
      const res = await request(app).get("/api/v1/users/me").set(f.bearer(user));
      expect(res.status).toBe(200);
      expect(res.body.data.user.email).toBe(user.email);
    }
  });

  it("takes custom emails, a different number of members, and extra people", async () => {
    const { users, household } = await f.makeWorld(["Alice", { name: "Bob", email: "bob@example.com" }, "Carol", "Dave"], { members: 3 });
    expect(users[1].email).toBe("bob@example.com");
    expect(await testDb.householdMember.count({ where: { householdId: household.id, status: "active" } })).toBe(3);
    expect(await testDb.user.count()).toBe(4);
  });

  it("makes a household the normal API sees: the owner can read it and a stranger gets 404", async () => {
    const { users: [alice, , carol], household } = await f.makeWorld();
    expect((await request(app).get(`/api/v1/households/${household.id}`).set(f.bearer(alice))).body.data.household.myRole).toBe("owner");
    expect((await request(app).get(`/api/v1/households/${household.id}`).set(f.bearer(carol))).status).toBe(404);
  });

  it("refuses a nonsense number of members", async () => {
    await expect(f.makeWorld(["Alice"], { members: 0 })).rejects.toThrow(/members must be/);
    await expect(f.makeWorld(["Alice"], { members: 2 })).rejects.toThrow(/members must be/);
  });
});
