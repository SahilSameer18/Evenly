import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";

// Real database. Skipped without TEST_DATABASE_URL.
describe.skipIf(!process.env.TEST_DATABASE_URL)("households: create, list, get", () => {
  let app, resetDb, testDb, f;
  let alice, bob;

  beforeAll(async () => {
    ({ default: app } = await import("../../../app.js"));
    ({ resetDb, testDb } = await import("../../../test/db-helper.js"));
    f = await import("../../../test/factories.js");
  });

  beforeEach(async () => {
    await resetDb();
    [alice, bob] = await Promise.all([f.makeUser("Alice"), f.makeUser("Bob")]);
  });

  const create = (user, body) => request(app).post("/api/v1/households").set(f.bearer(user)).send(body);

  describe("POST /api/v1/households", () => {
    it("creates the household with defaults and makes the creator its owner", async () => {
      const res = await create(alice, { name: "  Flat 302 " });
      expect(res.status).toBe(201);
      expect(res.body.data.household).toMatchObject({
        name: "Flat 302",
        currency: "INR",
        timezone: "Asia/Kolkata",
        defaultSplitMethod: "equal",
        myRole: "owner",
      });
      const rows = await testDb.householdMember.findMany({ where: { householdId: res.body.data.household.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ userId: alice.id, role: "owner", status: "active" });
    });

    it("accepts a timezone and a default split method", async () => {
      const res = await create(alice, { name: "Flat", timezone: "Europe/London", defaultSplitMethod: "weights" });
      expect(res.body.data.household).toMatchObject({ timezone: "Europe/London", defaultSplitMethod: "weights" });
    });

    it.each([
      ["a blank name", { name: "   " }, "name"],
      ["no name", {}, "name"],
      ["a currency (INR only for now)", { name: "Flat", currency: "USD" }, "currency"],
      ["an unknown field", { name: "Flat", ownerId: "someone-else" }, "ownerId"],
      ["a bad timezone", { name: "Flat", timezone: "Mars/Olympus" }, "timezone"],
      ["an offset instead of a zone", { name: "Flat", timezone: "+05:30" }, "timezone"],
      ["a bad split method", { name: "Flat", defaultSplitMethod: "random" }, "defaultSplitMethod"],
    ])("rejects %s with a 400 and creates nothing", async (_label, body, field) => {
      const res = await create(alice, body);
      expect(res.status).toBe(400);
      expect(res.body.error.details.map((d) => d.field)).toContain(field);
      expect(await testDb.household.count()).toBe(0);
    });

    it("requires a login", async () => {
      expect((await request(app).post("/api/v1/households").send({ name: "Flat" })).status).toBe(401);
    });
  });

  describe("GET /api/v1/households", () => {
    it("lists only my households, with my role in each", async () => {
      const mine = (await create(alice, { name: "Mine" })).body.data.household;
      const bobs = await f.makeHousehold(bob, "Bob's");
      await f.addMember(bobs, alice);

      const res = await request(app).get("/api/v1/households").set(f.bearer(alice));
      expect(res.status).toBe(200);
      expect(res.body.data.households.map((h) => [h.name, h.myRole]).sort()).toEqual([["Bob's", "member"], ["Mine", "owner"]]);
      expect(res.body.data.households.map((h) => h.id)).toContain(mine.id);
    });
  });

  describe("GET /api/v1/households/:householdId", () => {
    it("returns the household with active members, names only", async () => {
      const household = await f.makeHousehold(alice);
      await f.addMember(household, bob);

      const res = await request(app).get(`/api/v1/households/${household.id}`).set(f.bearer(bob));
      expect(res.status).toBe(200);
      const { members, myRole } = res.body.data.household;
      expect(myRole).toBe("member");
      expect(members.map((m) => [m.name, m.role])).toEqual([["Alice", "owner"], ["Bob", "member"]]);
      expect(JSON.stringify(res.body)).not.toContain("@example.com"); // no email addresses
    });

    it("leaves out members who have left", async () => {
      const household = await f.makeHousehold(alice);
      await f.addMember(household, bob);
      await testDb.householdMember.updateMany({ where: { householdId: household.id, userId: bob.id }, data: { status: "left", leftAt: new Date() } });

      const res = await request(app).get(`/api/v1/households/${household.id}`).set(f.bearer(alice));
      expect(res.body.data.household.members.map((m) => m.name)).toEqual(["Alice"]);
    });

    it("rejects an absurdly long id with a 400 before touching the database", async () => {
      const res = await request(app).get(`/api/v1/households/${"x".repeat(100)}`).set(f.bearer(alice));
      expect(res.status).toBe(400);
    });
  });
});
