import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";

// Real database. Skipped without TEST_DATABASE_URL.
describe.skipIf(!process.env.TEST_DATABASE_URL)("POST /expenses/:expenseId/refunds", () => {
  let app, resetDb, testDb, f;
  let alice, bob, carol, household, original; // alice paid 100000, split 50000 each

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
    original = await f.addExpense(household, alice, 100000, { [alice.id]: 50000, [bob.id]: 50000 });
  });

  const url = (id, suffix = "") => `/api/v1/households/${household.id}/expenses/${id}${suffix}`;
  const refund = (user, body, { id = original.id, key = randomUUID() } = {}) => {
    const req = request(app).post(url(id, "/refunds")).set(f.bearer(user));
    return (key === null ? req : req.set("Idempotency-Key", key)).send(body);
  };
  const share = (expense, user) => expense.splits.find((s) => s.userId === user.id).shareMinor;
  const refundCount = () => testDb.expense.count({ where: { type: "refund" } });

  describe("recording a refund", () => {
    it("shares it back in the original proportions, paid back to the original payer", async () => {
      const res = await refund(bob, { amountMinor: 20000 });
      expect(res.status).toBe(201);
      const { expense } = res.body.data;
      expect(expense).toMatchObject({
        type: "refund",
        refundOfId: original.id,
        paidById: alice.id,
        createdById: bob.id,
        amountMinor: 20000,
        splitMethod: "weights",
        status: "confirmed",
        description: "Refund: Test expense",
      });
      expect([share(expense, alice), share(expense, bob)]).toEqual([10000, 10000]);
    });

    it("an odd amount still adds up, the extra paisa going to one person", async () => {
      const { expense } = (await refund(alice, { amountMinor: 20001 })).body.data;
      expect(expense.splits.map((s) => s.shareMinor).sort()).toEqual([10000, 10001]);
    });

    it("changes the balance the way the ledger says: +40000 and -40000", async () => {
      await refund(alice, { amountMinor: 20000 });
      expect(await f.balancesOf(household, [alice, bob])).toEqual({ [alice.id]: 40000, [bob.id]: -40000 });
    });

    it("shares an on-behalf refund with the person who owed it", async () => {
      const onBehalf = await f.addExpense(household, alice, 6000, { [bob.id]: 6000 }, "on_behalf");
      const { expense } = (await refund(alice, { amountMinor: 2000 }, { id: onBehalf.id })).body.data;
      expect(expense.splits).toEqual([{ userId: bob.id, shareMinor: 2000 }]);
    });

    it("writes an expense.refunded audit event that names the original", async () => {
      const res = await refund(alice, { amountMinor: 20000 });
      const [event] = await testDb.auditEvent.findMany({ where: { entityId: res.body.data.expense.id } });
      expect(event).toMatchObject({ action: "expense.refunded", actorUserId: alice.id, requestId: res.headers["x-request-id"] });
      expect(event.after).toMatchObject({ refundOfId: original.id, amountMinor: 20000, type: "refund" });
    });

    it("shows up in the list when filtering for refunds", async () => {
      await refund(alice, { amountMinor: 20000 });
      const res = await request(app).get(`/api/v1/households/${household.id}/expenses`).query({ type: "refund" }).set(f.bearer(bob));
      expect(res.body.data.expenses.map((e) => e.type)).toEqual(["refund"]);
    });
  });

  describe("the limit", () => {
    it("can be refunded in parts up to the original amount and no further", async () => {
      expect((await refund(alice, { amountMinor: 60000 })).status).toBe(201);
      const tooMuch = await refund(alice, { amountMinor: 50000 });
      expect(tooMuch.status).toBe(422);
      expect(tooMuch.body.error).toMatchObject({ code: "REFUND_EXCEEDS_ORIGINAL", details: { refundableMinor: 40000 } });

      expect((await refund(alice, { amountMinor: 40000 })).status).toBe(201);
      expect(await f.balancesOf(household, [alice, bob])).toEqual({ [alice.id]: 0, [bob.id]: 0 });
      const none = await refund(alice, { amountMinor: 1 });
      expect(none.status).toBe(422);
      expect(none.body.error.details.refundableMinor).toBe(0);
    });

    it("a refund bigger than the original is a 422 straight away", async () => {
      const res = await refund(alice, { amountMinor: 100001 });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("REFUND_EXCEEDS_ORIGINAL");
      expect(await refundCount()).toBe(0);
    });

    it("two refunds at once cannot together go over it: exactly one succeeds", async () => {
      const [a, b] = await Promise.all([refund(alice, { amountMinor: 60000 }), refund(bob, { amountMinor: 60000 })]);
      expect([a.status, b.status].sort()).toEqual([201, 422]);
      expect(await refundCount()).toBe(1);
    });

    it("reversing a refund frees its amount again", async () => {
      const first = (await refund(alice, { amountMinor: 60000 })).body.data.expense;
      expect((await refund(bob, { amountMinor: 60000 })).status).toBe(422);

      const reversed = await request(app).post(url(first.id, "/reverse")).set(f.bearer(alice)).send({ reason: "Wrong amount" });
      expect(reversed.status).toBe(200);
      expect(await f.balancesOf(household, [alice, bob])).toEqual({ [alice.id]: 50000, [bob.id]: -50000 }); // back to the original

      expect((await refund(bob, { amountMinor: 60000 })).status).toBe(201);
      expect(await f.balancesOf(household, [alice, bob])).toEqual({ [alice.id]: 20000, [bob.id]: -20000 });
    });
  });

  describe("what can be refunded", () => {
    it("not a personal expense, a refund, or a reversed expense", async () => {
      const personal = await f.addExpense(household, alice, 500, { [alice.id]: 500 }, "personal");
      const aRefund = (await refund(alice, { amountMinor: 1000 })).body.data.expense;
      const reversed = await f.addExpense(household, alice, 500, { [alice.id]: 250, [bob.id]: 250 }, "shared", { status: "reversed" });
      for (const target of [personal, aRefund, reversed]) {
        const res = await refund(alice, { amountMinor: 100 }, { id: target.id });
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe("NOT_REFUNDABLE");
      }
    });

    it("someone else's personal expense is a 404", async () => {
      const theirs = await f.addExpense(household, bob, 500, { [bob.id]: 500 }, "personal");
      expect((await refund(alice, { amountMinor: 100 }, { id: theirs.id })).status).toBe(404);
    });

    it("an unknown expense is a 404", async () => {
      expect((await refund(alice, { amountMinor: 100 }, { id: "no-such-expense" })).status).toBe(404);
    });
  });

  describe("an expense that has refunds", () => {
    it("cannot be edited or reversed until they are reversed", async () => {
      await refund(alice, { amountMinor: 20000 });
      const edit = await request(app)
        .patch(url(original.id))
        .set(f.bearer(alice))
        .send({ type: "shared", version: 1, description: "x", amountMinor: 100000, split: { method: "equal", participants: [alice.id, bob.id] } });
      const reverse = await request(app).post(url(original.id, "/reverse")).set(f.bearer(alice)).send({ reason: "x" });
      expect([edit.status, edit.body.error.code]).toEqual([409, "HAS_REFUNDS"]);
      expect([reverse.status, reverse.body.error.code]).toEqual([409, "HAS_REFUNDS"]);
    });
  });

  describe("retries", () => {
    it("returns the same refund for the same key and request, and creates one", async () => {
      const key = randomUUID();
      const first = await refund(alice, { amountMinor: 20000 }, { key });
      const retry = await refund(alice, { amountMinor: 20000 }, { key });
      expect(retry.status).toBe(201);
      expect(retry.body.data.expense.id).toBe(first.body.data.expense.id);
      expect(retry.headers["idempotent-replayed"]).toBe("true");
      expect(await refundCount()).toBe(1);
    });

    it("refuses a reused key with a different amount, or for a different expense", async () => {
      const key = randomUUID();
      await refund(alice, { amountMinor: 20000 }, { key });
      const otherAmount = await refund(alice, { amountMinor: 30000 }, { key });
      expect([otherAmount.status, otherAmount.body.error.code]).toEqual([422, "IDEMPOTENCY_KEY_REUSED"]);

      const another = await f.addExpense(household, alice, 1000, { [alice.id]: 500, [bob.id]: 500 });
      const otherExpense = await refund(alice, { amountMinor: 20000 }, { key, id: another.id });
      expect(otherExpense.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
      expect(await refundCount()).toBe(1);
    });

    it("needs an Idempotency-Key", async () => {
      const res = await refund(alice, { amountMinor: 100 }, { key: null });
      expect(res.status).toBe(400);
      expect(res.body.error.details.map((d) => d.field)).toContain("Idempotency-Key");
    });
  });

  describe("bad requests and access", () => {
    it.each([
      ["a zero amount", { amountMinor: 0 }],
      ["a negative amount", { amountMinor: -5 }],
      ["a fractional amount", { amountMinor: 10.5 }],
      ["no amount", {}],
      ["an unknown field", { amountMinor: 100, refundOfId: "x" }],
      ["a date in the future", { amountMinor: 100, occurredAt: new Date(Date.now() + 86_400_000).toISOString() }],
    ])("rejects %s with a 400", async (_label, payload) => {
      const res = await refund(alice, payload);
      expect(res.status).toBe(400);
      expect(await refundCount()).toBe(0);
    });

    it("a stranger gets 404 and nobody gets 401", async () => {
      expect((await refund(carol, { amountMinor: 100 })).status).toBe(404);
      const res = await request(app).post(url(original.id, "/refunds")).set("Idempotency-Key", randomUUID()).send({ amountMinor: 100 });
      expect(res.status).toBe(401);
      expect(await refundCount()).toBe(0);
    });
  });
});
