import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";

// The tenancy suite. Real database, real queries. Skipped without TEST_DATABASE_URL.
// It grows as routes arrive; today it covers the read side (membership check, list, get).
describe.skipIf(!process.env.TEST_DATABASE_URL)("household authorization", () => {
  let app, resetDb, testDb, f;
  let alice, bob, carol, household; // alice owns it, bob is a member, carol is a stranger

  beforeAll(async () => {
    ({ default: app } = await import("../../../app.js"));
    ({ resetDb, testDb } = await import("../../../test/db-helper.js"));
    f = await import("../../../test/factories.js");
  });

  beforeEach(async () => {
    await resetDb();
    alice = await f.makeUser("Alice");
    bob = await f.makeUser("Bob");
    carol = await f.makeUser("Carol");
    household = await f.makeHousehold(alice);
    await f.addMember(household, bob);
  });

  const get = (user, path) => request(app).get(`/api/v1${path}`).set(f.bearer(user));
  const shape = (res) => ({ status: res.status, error: res.body.error });

  describe("a stranger", () => {
    it("gets 404 for a household she is not in", async () => {
      const res = await get(carol, `/households/${household.id}`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    });

    it("sees nothing of it in her own list", async () => {
      expect((await get(carol, "/households")).body.data.households).toEqual([]);
    });

    it("cannot tell a real household from one that does not exist", async () => {
      const real = await get(carol, `/households/${household.id}`);
      const fake = await get(carol, "/households/does-not-exist-123");
      expect(shape(real)).toEqual(shape(fake));
    });
  });

  describe("members", () => {
    it("both owner and member can read the household", async () => {
      expect((await get(alice, `/households/${household.id}`)).body.data.household.myRole).toBe("owner");
      expect((await get(bob, `/households/${household.id}`)).body.data.household.myRole).toBe("member");
    });
  });

  describe("someone who left", () => {
    it("loses access straight away", async () => {
      await testDb.householdMember.updateMany({
        where: { householdId: household.id, userId: bob.id },
        data: { status: "left", leftAt: new Date() },
      });
      expect((await get(bob, `/households/${household.id}`)).status).toBe(404);
      expect((await get(bob, "/households")).body.data.households).toEqual([]);
      expect((await get(alice, `/households/${household.id}`)).status).toBe(200);
    });
  });

  describe("an archived household", () => {
    it("is gone for everyone, including its old members", async () => {
      await testDb.household.update({ where: { id: household.id }, data: { archivedAt: new Date() } });
      expect((await get(alice, `/households/${household.id}`)).status).toBe(404);
      expect((await get(alice, "/households")).body.data.households).toEqual([]);
    });
  });

  describe("two households", () => {
    it("never leak into each other", async () => {
      const other = await f.makeHousehold(carol, "Carol's flat");
      const mine = await get(alice, "/households");
      expect(mine.body.data.households.map((h) => h.id)).toEqual([household.id]);
      expect((await get(alice, `/households/${other.id}`)).status).toBe(404);
      expect((await get(carol, `/households/${household.id}`)).status).toBe(404);
    });
  });

  describe("no or bad credentials", () => {
    it("gets 401, not 404", async () => {
      const id = household.id;
      expect((await request(app).get(`/api/v1/households/${id}`)).status).toBe(401);
      expect((await request(app).get("/api/v1/households")).status).toBe(401);
      expect((await request(app).get(`/api/v1/households/${id}`).set("Authorization", "Bearer junk")).status).toBe(401);
    });
  });
});
