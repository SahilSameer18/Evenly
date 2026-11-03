import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";

// Real database. Skipped without TEST_DATABASE_URL.
describe.skipIf(!process.env.TEST_DATABASE_URL)("expense history and the audit trail", () => {
  let app, resetDb, testDb, f;
  let alice, bob, carol, household;

  beforeAll(async () => {
    ({ default: app } = await import("../../../app.js"));
    ({ resetDb, testDb } = await import("../../../test/db-helper.js"));
    f = await import("../../../test/factories.js");
  });

  beforeEach(async () => {
    await resetDb();
    ({ users: [alice, bob, carol], household } = await f.makeWorld());
  });

  const url = (id = "", suffix = "", householdId = household.id) => `/api/v1/households/${householdId}/expenses${id ? `/${id}` : ""}${suffix}`;
  const call = (method, user, path, body, key) => {
    let req = request(app)[method](path).set(f.bearer(user));
    if (key) req = req.set("Idempotency-Key", key);
    return body === undefined ? req : req.send(body);
  };
  const history = (user, id) => call("get", user, url(id, "/history"));

  // A whole life, driven through the real endpoints.
  async function liveALife() {
    const created = await call("post", alice, url(), { type: "shared", description: "Groceries", amountMinor: 10000, split: { method: "equal", participants: [alice.id, bob.id] } }, randomUUID());
    const id = created.body.data.expense.id;
    await call("patch", alice, url(id), { type: "shared", version: 1, description: "Groceries and milk", amountMinor: 12000, split: { method: "equal", participants: [alice.id, bob.id] } });
    await call("post", bob, url(id, "/dispute"), { reason: "I was not there" });
    await call("post", bob, url(id, "/dispute/withdraw"));
    await call("post", alice, url(id, "/reverse"), { reason: "Entered twice" });
    return id;
  }

  describe("GET /expenses/:expenseId/history", () => {
    it("lists every change in order, with who did it and why", async () => {
      const id = await liveALife();
      const res = await history(bob, id);
      expect(res.status).toBe(200);
      const events = res.body.data.history;

      expect(events.map((e) => e.action)).toEqual([
        "expense.created",
        "expense.updated",
        "expense.disputed",
        "expense.dispute_withdrawn",
        "expense.reversed",
      ]);
      expect(events.map((e) => e.actor.name)).toEqual(["Alice", "Alice", "Bob", "Bob", "Alice"]);
      expect(events.map((e) => e.reason)).toEqual([null, null, "I was not there", null, "Entered twice"]);
      expect(events.every((e) => typeof e.requestId === "string" && e.requestId.length > 0)).toBe(true);
    });

    it("keeps the before and after of each change", async () => {
      const id = await liveALife();
      const events = (await history(alice, id)).body.data.history;
      expect(events[0]).toMatchObject({ before: null, after: { amountMinor: 10000, version: 1 } });
      expect(events[1].before).toMatchObject({ description: "Groceries", amountMinor: 10000, version: 1 });
      expect(events[1].after).toMatchObject({ description: "Groceries and milk", amountMinor: 12000, version: 2 });
      expect(events[4].after).toMatchObject({ status: "reversed", version: 5 });
    });

    it("includes the refund's own record on the refund", async () => {
      const original = await f.addExpense(household, alice, 10000, { [alice.id]: 5000, [bob.id]: 5000 });
      const refund = await call("post", alice, url(original.id, "/refunds"), { amountMinor: 1000 }, randomUUID());
      const events = (await history(alice, refund.body.data.expense.id)).body.data.history;
      expect(events.map((e) => e.action)).toEqual(["expense.refunded"]);
    });

    it("shows only the events of that expense", async () => {
      const a = await liveALife();
      const other = await call("post", alice, url(), { type: "personal", description: "Headphones", amountMinor: 500 }, randomUUID());
      const events = (await history(alice, other.body.data.expense.id)).body.data.history;
      expect(events).toHaveLength(1);
      expect(events[0].action).toBe("expense.created");
      expect((await history(alice, a)).body.data.history).toHaveLength(5);
    });

    it("a personal expense's history is private to its creator", async () => {
      const personal = await call("post", alice, url(), { type: "personal", description: "Headphones", amountMinor: 500 }, randomUUID());
      const id = personal.body.data.expense.id;
      expect((await history(alice, id)).status).toBe(200);
      const bobs = await history(bob, id);
      const fake = await history(bob, "no-such-expense");
      expect([bobs.status, bobs.body.error]).toEqual([fake.status, fake.body.error]);
    });

    it("a stranger gets 404 and nobody gets 401", async () => {
      const id = await liveALife();
      expect((await history(carol, id)).status).toBe(404);
      expect((await request(app).get(url(id, "/history"))).status).toBe(401);
    });
  });

  describe("nobody can rewrite history", () => {
    it("has no route to change or delete audit events", async () => {
      const id = await liveALife();
      for (const method of ["patch", "put", "post", "delete"]) {
        const res = await call(method, alice, url(id, "/history"), {});
        expect(res.status).toBe(404);
      }
      expect((await history(alice, id)).body.data.history).toHaveLength(5);
    });

    it("is also enforced by the database itself", async () => {
      const id = await liveALife();
      const event = await testDb.auditEvent.findFirst({ where: { entityId: id } });
      await expect(testDb.auditEvent.update({ where: { id: event.id }, data: { action: "tampered" } })).rejects.toThrow();
      await expect(testDb.auditEvent.delete({ where: { id: event.id } })).rejects.toThrow();
      expect((await testDb.auditEvent.findUnique({ where: { id: event.id } })).action).toBe("expense.created");
    });
  });

  describe("another household's expense through your own household's URL", () => {
    it("is a 404 on every lifecycle route", async () => {
      const hers = await f.makeHousehold(carol, "Carol's flat");
      const theirs = await f.addExpense(hers, carol, 1000, { [carol.id]: 500, [alice.id]: 500 });
      const id = theirs.id;
      const results = await Promise.all([
        call("get", alice, url(id)),
        call("patch", alice, url(id), { type: "shared", version: 1, description: "x", amountMinor: 1000, split: { method: "equal", participants: [alice.id] } }),
        call("post", alice, url(id, "/reverse"), { reason: "x" }),
        call("post", alice, url(id, "/dispute"), { reason: "x" }),
        call("post", alice, url(id, "/dispute/withdraw")),
        call("post", alice, url(id, "/refunds"), { amountMinor: 100 }, randomUUID()),
        call("get", alice, url(id, "/history")),
      ]);
      expect(results.map((r) => r.status)).toEqual([404, 404, 404, 404, 404, 404, 404]);
      expect((await testDb.expense.findUnique({ where: { id } })).version).toBe(1);
    });
  });
});
