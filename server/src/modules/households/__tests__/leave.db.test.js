import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";

// Real database. Skipped without TEST_DATABASE_URL.
describe.skipIf(!process.env.TEST_DATABASE_URL)("POST /api/v1/households/:householdId/leave", () => {
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

  const leave = (user, body = {}) => request(app).post(`/api/v1/households/${household.id}/leave`).set(f.bearer(user)).send(body);
  const read = (user) => request(app).get(`/api/v1/households/${household.id}`).set(f.bearer(user));
  const row = (user) => testDb.householdMember.findFirst({ where: { householdId: household.id, userId: user.id } });
  // Alice paid 1000 split 500/500: alice is owed 500, bob owes 500.
  const bobOwesAlice = () => f.addExpense(household, alice, 1000, { [alice.id]: 500, [bob.id]: 500 });

  describe("a member with nothing outstanding", () => {
    it("leaves, is marked left, and loses access straight away", async () => {
      const res = await leave(bob);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ left: true, archived: false });
      expect(await row(bob)).toMatchObject({ status: "left", role: "member" });
      expect((await row(bob)).leftAt).toBeInstanceOf(Date);
      expect((await read(bob)).status).toBe(404);
      expect((await request(app).get("/api/v1/households").set(f.bearer(bob))).body.data.households).toEqual([]);
      expect((await read(alice)).body.data.household.members.map((m) => m.name)).toEqual(["Alice"]);
    });
  });

  describe("the balance rule", () => {
    it("blocks both the person who owes and the person who is owed", async () => {
      await bobOwesAlice();
      for (const user of [bob, alice]) {
        const res = await leave(user, user === alice ? { newOwnerId: bob.id } : {});
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe("BALANCE_NOT_ZERO");
      }
      expect((await row(bob)).status).toBe("active");
      expect((await row(alice)).status).toBe("active");
    });

    it("is not unblocked by a repayment that is still pending", async () => {
      await bobOwesAlice();
      await f.addRepayment(household, bob, alice, 500, "pending");
      expect((await leave(bob)).status).toBe(409);
    });

    it("lets them go once a confirmed repayment settles it", async () => {
      await bobOwesAlice();
      await f.addRepayment(household, bob, alice, 500);
      expect((await leave(bob)).status).toBe(200);
    });

    it("ignores personal expenses", async () => {
      await f.addExpense(household, bob, 300, { [bob.id]: 300 }, "personal");
      expect((await leave(bob)).status).toBe(200);
    });

    it("still counts a former member's history when the rest settle up", async () => {
      await bobOwesAlice();
      await f.addRepayment(household, bob, alice, 500);
      await leave(bob);
      const res = await leave(alice); // bob left, but his records must still resolve
      expect(res.status).toBe(200);
      expect(res.body.data.archived).toBe(true);
    });
  });

  describe("the owner", () => {
    it("must name a new owner while other members remain", async () => {
      const res = await leave(alice);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("OWNERSHIP_TRANSFER_REQUIRED");
      expect((await row(alice)).status).toBe("active");
    });

    it("hands over ownership and leaves in one step", async () => {
      const res = await leave(alice, { newOwnerId: bob.id });
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ left: true, archived: false });
      expect(await row(bob)).toMatchObject({ role: "owner", status: "active" });
      expect(await row(alice)).toMatchObject({ role: "member", status: "left" });
      expect((await read(alice)).status).toBe(404);
      const rename = await request(app).patch(`/api/v1/households/${household.id}`).set(f.bearer(bob)).send({ name: "Bob's flat" });
      expect(rename.status).toBe(200);
    });

    it.each([
      ["a stranger", () => carol.id],
      ["themselves", () => alice.id],
      ["someone who already left", null],
    ])("cannot name %s as the new owner", async (label, pick) => {
      if (!pick) {
        await testDb.householdMember.updateMany({ where: { householdId: household.id, userId: bob.id }, data: { status: "left", leftAt: new Date() } });
        await f.addMember(household, carol); // keep another active member so a successor is required
      }
      const res = await leave(alice, { newOwnerId: pick ? pick() : bob.id });
      expect(res.status).toBe(400);
      expect(res.body.error.details.map((d) => d.field)).toContain("newOwnerId");
      expect((await row(alice)).role).toBe("owner");
    });

    it("closes the household when the last person leaves", async () => {
      await leave(bob);
      const res = await leave(alice);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ left: true, archived: true });
      expect((await testDb.household.findUnique({ where: { id: household.id } })).archivedAt).toBeInstanceOf(Date);
      expect((await read(alice)).status).toBe(404);
    });
  });

  describe("other rules", () => {
    it("rejects a member who tries to name a new owner", async () => {
      const res = await leave(bob, { newOwnerId: alice.id });
      expect(res.status).toBe(400);
      expect((await row(bob)).status).toBe("active");
    });

    it("rejects unknown fields", async () => {
      expect((await leave(bob, { archive: true })).status).toBe(400);
    });

    it("gives a stranger 404 and nobody 401", async () => {
      expect((await leave(carol)).status).toBe(404);
      expect((await request(app).post(`/api/v1/households/${household.id}/leave`).send({})).status).toBe(401);
    });
  });
});
