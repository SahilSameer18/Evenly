import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";

// Real database. Skipped without TEST_DATABASE_URL.
describe.skipIf(!process.env.TEST_DATABASE_URL)("confirm, reject and cancel a repayment", () => {
  let app, resetDb, testDb, f;
  let alice, bob, carol, household; // bob sends to alice; carol is a stranger

  beforeAll(async () => {
    ({ default: app } = await import("../../../app.js"));
    ({ resetDb, testDb } = await import("../../../test/db-helper.js"));
    f = await import("../../../test/factories.js");
  });

  beforeEach(async () => {
    await resetDb();
    ({ users: [alice, bob, carol], household } = await f.makeWorld());
    // bob owes alice 5000
    await f.addExpense(household, alice, 10000, { [alice.id]: 5000, [bob.id]: 5000 });
  });

  const act = (user, id, action, body = {}, householdId = household.id) =>
    request(app).post(`/api/v1/households/${householdId}/settlements/${id}/${action}`).set(f.bearer(user)).send(body);
  const pending = (amount = 3000) => f.addRepayment(household, bob, alice, amount, "pending");
  const row = (id) => testDb.settlement.findUnique({ where: { id } });
  const events = (id) => testDb.auditEvent.findMany({ where: { entityId: id, entityType: "settlement" }, orderBy: { createdAt: "asc" } });

  describe("confirm (the recipient)", () => {
    it("moves the money, stamps the times, audits it and returns the new balances", async () => {
      const s = await pending(3000);
      const res = await act(alice, s.id, "confirm");
      expect(res.status).toBe(200);
      expect(res.body.data.settlement).toMatchObject({ id: s.id, status: "confirmed" });
      expect(res.body.data.settlement.confirmedAt).toBeTruthy();
      expect(res.body.data.settlement.resolvedAt).toBeTruthy();
      expect(res.body.data.balanceAfter).toEqual({ [alice.id]: 2000, [bob.id]: -2000 });
      expect(await f.balancesOf(household, [alice, bob])).toEqual({ [alice.id]: 2000, [bob.id]: -2000 });

      const [event] = await events(s.id);
      expect(event).toMatchObject({ action: "settlement.confirmed", actorUserId: alice.id, requestId: res.headers["x-request-id"] });
      expect(event.before).toMatchObject({ status: "pending" });
      expect(event.after).toMatchObject({ status: "confirmed" });
    });

    it("is safe to repeat: same answer, no second event", async () => {
      const s = await pending();
      await act(alice, s.id, "confirm");
      const again = await act(alice, s.id, "confirm");
      expect(again.status).toBe(200);
      expect(again.body.data.settlement.status).toBe("confirmed");
      expect(await events(s.id)).toHaveLength(1);
    });

    it("lets an overpayment flip the balance", async () => {
      const s = await pending(9000);
      await act(alice, s.id, "confirm");
      expect(await f.balancesOf(household, [alice, bob])).toEqual({ [alice.id]: -4000, [bob.id]: 4000 });
    });

    it("cannot be done by the sender", async () => {
      const s = await pending();
      const res = await act(bob, s.id, "confirm");
      expect(res.status).toBe(403);
      expect((await row(s.id)).status).toBe("pending");
      expect(await events(s.id)).toHaveLength(0);
    });
  });

  describe("reject (the recipient)", () => {
    it("moves nothing and keeps the reason", async () => {
      const s = await pending();
      const res = await act(alice, s.id, "reject", { reason: "  never arrived " });
      expect(res.status).toBe(200);
      expect(res.body.data.settlement).toMatchObject({ status: "rejected" });
      expect(res.body.data.settlement.resolvedAt).toBeTruthy();
      expect(res.body.data.settlement.confirmedAt).toBeNull();
      expect(await f.balancesOf(household, [alice, bob])).toEqual({ [alice.id]: 5000, [bob.id]: -5000 });
      const [event] = await events(s.id);
      expect(event).toMatchObject({ action: "settlement.rejected", reason: "never arrived" });
    });

    it("works without a reason, and is safe to repeat", async () => {
      const s = await pending();
      expect((await act(alice, s.id, "reject", undefined)).status).toBe(200);
      expect((await act(alice, s.id, "reject")).status).toBe(200);
      expect(await events(s.id)).toHaveLength(1);
    });

    it("cannot be done by the sender, and refuses unknown fields", async () => {
      const s = await pending();
      expect((await act(bob, s.id, "reject")).status).toBe(403);
      expect((await act(alice, s.id, "reject", { status: "x" })).status).toBe(400);
      expect((await row(s.id)).status).toBe("pending");
    });
  });

  describe("cancel (the sender)", () => {
    it("withdraws it and moves nothing", async () => {
      const s = await pending();
      const res = await act(bob, s.id, "cancel");
      expect(res.status).toBe(200);
      expect(res.body.data.settlement.status).toBe("cancelled");
      expect(await f.balancesOf(household, [alice, bob])).toEqual({ [alice.id]: 5000, [bob.id]: -5000 });
      expect((await events(s.id))[0]).toMatchObject({ action: "settlement.cancelled", actorUserId: bob.id });
    });

    it("is safe to repeat", async () => {
      const s = await pending();
      await act(bob, s.id, "cancel");
      expect((await act(bob, s.id, "cancel")).status).toBe(200);
      expect(await events(s.id)).toHaveLength(1);
    });

    it("cannot be done by the recipient", async () => {
      const s = await pending();
      expect((await act(alice, s.id, "cancel")).status).toBe(403);
      expect((await row(s.id)).status).toBe("pending");
    });
  });

  describe("once it is settled, it stays settled", () => {
    it.each([
      ["confirmed", "reject", "alice"],
      ["confirmed", "cancel", "bob"],
      ["cancelled", "confirm", "alice"],
      ["rejected", "confirm", "alice"],
      ["rejected", "cancel", "bob"],
      ["cancelled", "reject", "alice"],
    ])("a %s repayment cannot be %s-ed (409)", async (status, action, who) => {
      const s = await f.addRepayment(household, bob, alice, 1000, status);
      const res = await act(who === "alice" ? alice : bob, s.id, action);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("SETTLEMENT_NOT_PENDING");
      expect(res.body.error.details).toMatchObject({ status });
      expect((await row(s.id)).status).toBe(status);
      expect(await events(s.id)).toHaveLength(0);
    });
  });

  describe("races", () => {
    it("a confirm racing a cancel has exactly one winner, and the books match it", async () => {
      const s = await pending(3000);
      const [confirm, cancel] = await Promise.all([act(alice, s.id, "confirm"), act(bob, s.id, "cancel")]);
      const final = (await row(s.id)).status;
      expect(["confirmed", "cancelled"]).toContain(final);
      expect([confirm.status, cancel.status].sort()).toEqual([200, 409]);
      expect(confirm.status).toBe(final === "confirmed" ? 200 : 409);
      expect(await events(s.id)).toHaveLength(1);
      expect(await f.balancesOf(household, [alice, bob])).toEqual(
        final === "confirmed" ? { [alice.id]: 2000, [bob.id]: -2000 } : { [alice.id]: 5000, [bob.id]: -5000 },
      );
    });

    it("two confirms at once make one event", async () => {
      const s = await pending();
      const results = await Promise.all([act(alice, s.id, "confirm"), act(alice, s.id, "confirm")]);
      expect(results.map((r) => r.status)).toEqual([200, 200]);
      expect(await events(s.id)).toHaveLength(1);
    });
  });

  describe("who can reach it at all", () => {
    it.each(["confirm", "reject", "cancel"])("%s: a stranger gets 404, no token gets 401, an unknown id is 404", async (action) => {
      const s = await pending();
      expect((await act(carol, s.id, action)).status).toBe(404);
      expect((await request(app).post(`/api/v1/households/${household.id}/settlements/${s.id}/${action}`)).status).toBe(401);
      expect((await act(alice, "no-such-id", action)).status).toBe(404);
      expect((await row(s.id)).status).toBe("pending");
    });

    it.each(["confirm", "reject", "cancel"])("%s: another household's member cannot touch it, even by naming their own household", async (action) => {
      const s = await pending();
      const other = await f.makeWorld(["Dan", "Eve"]);
      const res = await act(other.users[0], s.id, action, {}, other.household.id);
      expect(res.status).toBe(404);
      expect((await row(s.id)).status).toBe("pending");
    });
  });
});
