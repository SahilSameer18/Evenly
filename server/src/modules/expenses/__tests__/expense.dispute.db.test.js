import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";

// Real database. Skipped without TEST_DATABASE_URL.
describe.skipIf(!process.env.TEST_DATABASE_URL)("disputes: POST /expenses/:expenseId/dispute and /dispute/withdraw", () => {
  let app, resetDb, testDb, f;
  let alice, bob, carol, dave, household; // alice owns and records, bob and dave are members, carol is a stranger

  beforeAll(async () => {
    ({ default: app } = await import("../../../app.js"));
    ({ resetDb, testDb } = await import("../../../test/db-helper.js"));
    f = await import("../../../test/factories.js");
  });

  beforeEach(async () => {
    await resetDb();
    // alice owns it, bob and dave are members, carol is a stranger (members are the first three people)
    ({ users: [alice, bob, dave, carol], household } = await f.makeWorld(["Alice", "Bob", "Dave", "Carol"], { members: 3 }));
  });

  const url = (id, suffix) => `/api/v1/households/${household.id}/expenses/${id}${suffix}`;
  const dispute = (user, id, body = { reason: "That was not 500" }) => request(app).post(url(id, "/dispute")).set(f.bearer(user)).send(body);
  const withdraw = (user, id) => request(app).post(url(id, "/dispute/withdraw")).set(f.bearer(user));
  const make = (extra = {}) => f.addExpense(household, alice, 9000, { [alice.id]: 3000, [bob.id]: 3000, [dave.id]: 3000 }, "shared", extra);
  const row = (id) => testDb.expense.findUnique({ where: { id } });
  const actions = async (id) => (await testDb.auditEvent.findMany({ where: { entityId: id }, orderBy: { createdAt: "asc" } })).map((e) => e.action);

  describe("raising a dispute", () => {
    it("lets another member flag it, with a reason in the audit trail", async () => {
      const e = await make();
      const res = await dispute(bob, e.id, { reason: "  That was not 500 " });
      expect(res.status).toBe(200);
      expect(res.body.data.expense).toMatchObject({ status: "disputed", version: 2 });

      const [event] = await testDb.auditEvent.findMany({ where: { entityId: e.id, action: "expense.disputed" } });
      expect(event).toMatchObject({ actorUserId: bob.id, reason: "That was not 500", requestId: res.headers["x-request-id"] });
      expect(event.before).toMatchObject({ status: "confirmed" });
      expect(event.after).toMatchObject({ status: "disputed" });
    });

    it("still counts in the balance while it is disputed", async () => {
      const e = await make();
      const before = await f.balancesOf(household, [alice, bob, dave]);
      await dispute(bob, e.id);
      expect(await f.balancesOf(household, [alice, bob, dave])).toEqual(before);
      expect(before[alice.id]).toBe(6000);
    });

    it("cannot be raised by the person who recorded it", async () => {
      const e = await make();
      const res = await dispute(alice, e.id);
      expect(res.status).toBe(403);
      expect((await row(e.id)).status).toBe("confirmed");
    });

    it("cannot be raised twice: the second member gets 409", async () => {
      const e = await make();
      await dispute(bob, e.id);
      const second = await dispute(dave, e.id);
      expect(second.status).toBe(409);
      expect(second.body.error.code).toBe("ALREADY_DISPUTED");
      expect(await testDb.auditEvent.count({ where: { entityId: e.id, action: "expense.disputed" } })).toBe(1);
    });

    it("lets exactly one of two simultaneous disputes win", async () => {
      const e = await make();
      const [a, b] = await Promise.all([dispute(bob, e.id), dispute(dave, e.id)]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      expect(await testDb.auditEvent.count({ where: { entityId: e.id, action: "expense.disputed" } })).toBe(1);
    });

    it("cannot dispute a reversed expense", async () => {
      const e = await make({ status: "reversed" });
      const res = await dispute(bob, e.id);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("EXPENSE_REVERSED");
    });

    it("needs a reason", async () => {
      const e = await make();
      for (const payload of [{}, { reason: "  " }, { reason: "x".repeat(301) }, { reason: "ok", status: "disputed" }]) {
        expect((await dispute(bob, e.id, payload)).status).toBe(400);
      }
      expect((await row(e.id)).status).toBe("confirmed");
    });

    it("a stranger gets 404, nobody 401, and another member's personal expense is a 404", async () => {
      const e = await make();
      expect((await dispute(carol, e.id)).status).toBe(404);
      expect((await request(app).post(url(e.id, "/dispute")).send({ reason: "x" })).status).toBe(401);
      const personal = await f.addExpense(household, alice, 500, { [alice.id]: 500 }, "personal");
      expect((await dispute(bob, personal.id)).status).toBe(404);
    });
  });

  describe("withdrawing a dispute", () => {
    it("lets the person who raised it clear it", async () => {
      const e = await make();
      await dispute(bob, e.id);
      const res = await withdraw(bob, e.id);
      expect(res.status).toBe(200);
      expect(res.body.data.expense).toMatchObject({ status: "confirmed", version: 3 });
      expect(await actions(e.id)).toEqual(["expense.disputed", "expense.dispute_withdrawn"]);
    });

    it("is refused for everyone else, including the person who recorded the expense", async () => {
      const e = await make();
      await dispute(bob, e.id);
      for (const user of [alice, dave]) {
        const res = await withdraw(user, e.id);
        expect(res.status).toBe(403);
      }
      expect((await row(e.id)).status).toBe("disputed");
    });

    it("is a 409 when nothing is disputed, and a 404 for a stranger", async () => {
      const e = await make();
      const res = await withdraw(bob, e.id);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("NOT_DISPUTED");
      expect((await withdraw(carol, e.id)).status).toBe(404);
    });

    it("a new dispute after a withdrawal is again owned by whoever raises it", async () => {
      const e = await make();
      await dispute(bob, e.id);
      await withdraw(bob, e.id);
      await dispute(dave, e.id);
      expect((await withdraw(bob, e.id)).status).toBe(403);
      expect((await withdraw(dave, e.id)).status).toBe(200);
    });
  });

  describe("how the person who recorded it resolves a dispute", () => {
    it("by editing it", async () => {
      const e = await make();
      await dispute(bob, e.id);
      const res = await request(app)
        .patch(url(e.id, ""))
        .set(f.bearer(alice))
        .send({ type: "shared", version: 2, description: "Fixed", amountMinor: 9000, split: { method: "equal", participants: [alice.id, bob.id, dave.id] } });
      expect(res.status).toBe(200);
      expect(res.body.data.expense.status).toBe("confirmed");
    });

    it("by reversing it", async () => {
      const e = await make();
      await dispute(bob, e.id);
      const res = await request(app).post(url(e.id, "/reverse")).set(f.bearer(alice)).send({ reason: "Bob is right" });
      expect(res.body.data.expense.status).toBe("reversed");
    });
  });
});
