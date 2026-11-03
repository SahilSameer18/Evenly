import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";

// Real database. Skipped without TEST_DATABASE_URL.
describe.skipIf(!process.env.TEST_DATABASE_URL)("PATCH /expenses/:expenseId (edit)", () => {
  let app, resetDb, testDb, f;
  let alice, bob, carol, household; // alice records things, bob is a member, carol is a stranger

  beforeAll(async () => {
    ({ default: app } = await import("../../../app.js"));
    ({ resetDb, testDb } = await import("../../../test/db-helper.js"));
    f = await import("../../../test/factories.js");
  });

  beforeEach(async () => {
    await resetDb();
    ({ users: [alice, bob, carol], household } = await f.makeWorld());
  });

  const patch = (user, id, body, householdId = household.id) =>
    request(app).patch(`/api/v1/households/${householdId}/expenses/${id}`).set(f.bearer(user)).send(body);
  const body = (over = {}) => ({
    type: "shared",
    version: 1,
    description: "Rent",
    amountMinor: 10000,
    split: { method: "equal", participants: [alice.id, bob.id] },
    ...over,
  });
  // alice paid 10000 and the splits are 5000 each, unless told otherwise.
  const make = (extra = {}, amount = 10000, payer = alice) =>
    f.addExpense(household, payer, amount, { [alice.id]: amount / 2, [bob.id]: amount / 2 }, "shared", extra);
  const row = (id) => testDb.expense.findUnique({ where: { id }, include: { splits: true } });
  const sum = (splits) => splits.reduce((total, s) => total + s.shareMinor, 0);
  const updatedEvents = (id) => testDb.auditEvent.count({ where: { entityId: id, action: "expense.updated" } });
  const unchanged = async (id) => {
    expect((await row(id)).version).toBe(1);
    expect(await updatedEvents(id)).toBe(0);
  };

  describe("what an edit changes", () => {
    it("replaces the content and recomputes splits that still add up", async () => {
      const e = await make();
      const split = { method: "percentage", parts: [{ userId: alice.id, bps: 6000 }, { userId: bob.id, bps: 4000 }] };
      const res = await patch(alice, e.id, body({ description: "Rent and bills", amountMinor: 20001, split }));
      expect(res.status).toBe(200);
      const { expense } = res.body.data;
      expect(expense).toMatchObject({ description: "Rent and bills", amountMinor: 20001, version: 2, status: "confirmed", splitMethod: "percentage" });
      expect(sum(expense.splits)).toBe(20001);
      expect(expense.splits.find((s) => s.userId === alice.id).shareMinor).toBe(12001);
      expect((await row(e.id)).splits).toHaveLength(2); // the old splits are gone, not left beside the new ones
    });

    it("clears notes and category that are not sent, keeps the date and the payer", async () => {
      const category = await testDb.category.create({ data: { householdId: household.id, name: "Bills" } });
      const when = new Date("2026-10-01T10:00:00.000Z");
      const e = await make({ notes: "old note", categoryId: category.id, occurredAt: when, paidById: bob.id });
      const { expense } = (await patch(alice, e.id, body())).body.data;
      expect(expense).toMatchObject({ notes: null, categoryId: null, occurredAt: when.toISOString(), paidById: bob.id });
    });

    it("can change the payer, the date and the notes when they are sent", async () => {
      const e = await make({ paidById: bob.id });
      const res = await patch(alice, e.id, body({ paidById: alice.id, notes: "  paid by me  ", occurredAt: "2026-09-01T00:00:00Z" }));
      expect(res.body.data.expense).toMatchObject({ paidById: alice.id, notes: "paid by me", occurredAt: "2026-09-01T00:00:00.000Z" });
    });

    it("edits a personal expense", async () => {
      const e = await f.addExpense(household, alice, 3000, { [alice.id]: 3000 }, "personal");
      const res = await patch(alice, e.id, { type: "personal", version: 1, description: "Headphones", amountMinor: 4000 });
      expect(res.body.data.expense.splits).toEqual([{ userId: alice.id, shareMinor: 4000 }]);
    });

    it("edits an on-behalf expense", async () => {
      const e = await f.addExpense(household, alice, 600, { [bob.id]: 600 }, "on_behalf");
      const res = await patch(alice, e.id, { type: "on_behalf", version: 1, description: "Medicine", amountMinor: 900, beneficiaryId: bob.id });
      expect(res.body.data.expense.splits).toEqual([{ userId: bob.id, shareMinor: 900 }]);
    });

    it("an edit after a repayment still balances", async () => {
      const e = await make();
      await f.addRepayment(household, bob, alice, 2000);
      await patch(alice, e.id, body({ amountMinor: 20000 }));
      expect(await f.balancesOf(household, [alice, bob])).toEqual({ [alice.id]: 8000, [bob.id]: -8000 });
    });
  });

  describe("the audit trail", () => {
    it("records who changed what, with the before and after, in one event", async () => {
      const e = await make();
      const res = await patch(alice, e.id, body({ amountMinor: 20000 }));
      const events = await testDb.auditEvent.findMany({ where: { entityId: e.id, action: "expense.updated" } });
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ actorUserId: alice.id, requestId: res.headers["x-request-id"], householdId: household.id });
      expect(events[0].before).toMatchObject({ amountMinor: 10000, version: 1 });
      expect(events[0].after).toMatchObject({ amountMinor: 20000, version: 2 });
    });
  });

  describe("optimistic locking", () => {
    it("refuses a stale version and says which version is current", async () => {
      const e = await make();
      const stale = await patch(alice, e.id, body({ version: 5 }));
      expect(stale.status).toBe(409);
      expect(stale.body.error).toMatchObject({ code: "STALE_VERSION", details: { currentVersion: 1 } });
      expect((await patch(alice, e.id, body())).status).toBe(200);
      const again = await patch(alice, e.id, body());
      expect(again.status).toBe(409);
      expect(again.body.error.details.currentVersion).toBe(2);
    });

    it("lets exactly one of two simultaneous edits win, every time", async () => {
      for (let attempt = 0; attempt < 4; attempt++) {
        const e = await make({ description: `Race ${attempt}` });
        const [a, b] = await Promise.all([patch(alice, e.id, body({ description: "A" })), patch(alice, e.id, body({ description: "B" }))]);
        expect([a.status, b.status].sort()).toEqual([200, 409]);
        expect((a.status === 409 ? a : b).body.error.code).toBe("STALE_VERSION");

        const stored = await row(e.id);
        expect(stored.version).toBe(2);
        expect(sum(stored.splits)).toBe(10000);
        expect(await updatedEvents(e.id)).toBe(1);
      }
    }, 60_000);
  });

  describe("refusals leave the expense untouched", () => {
    it("only the person who recorded it may edit: a member gets 403, a stranger 404", async () => {
      const e = await make();
      expect((await patch(bob, e.id, body())).status).toBe(403);
      expect((await patch(carol, e.id, body())).status).toBe(404);
      expect((await request(app).patch(`/api/v1/households/${household.id}/expenses/${e.id}`).send(body())).status).toBe(401);
      await unchanged(e.id);
    });

    it("someone else's personal expense is a 404, not a 403", async () => {
      const mine = await f.addExpense(household, bob, 500, { [bob.id]: 500 }, "personal");
      const res = await patch(alice, mine.id, { type: "personal", version: 1, description: "x", amountMinor: 600 });
      expect(res.status).toBe(404);
      await unchanged(mine.id);
    });

    it("a reversed expense cannot be edited", async () => {
      const e = await make({ status: "reversed" });
      const res = await patch(alice, e.id, body());
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("EXPENSE_REVERSED");
    });

    it("the type cannot be changed", async () => {
      const e = await make();
      const res = await patch(alice, e.id, { type: "personal", version: 1, description: "x", amountMinor: 100 });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("TYPE_CANNOT_CHANGE");
      await unchanged(e.id);
    });

    it("a refund cannot be edited", async () => {
      const original = await make();
      const refund = await f.addExpense(household, alice, 1000, { [alice.id]: 500, [bob.id]: 500 }, "refund", { refundOfId: original.id });
      const res = await patch(alice, refund.id, body({ amountMinor: 1000 }));
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("REFUND_NOT_EDITABLE");
    });

    it("an expense with refunds cannot be edited until they are reversed", async () => {
      const original = await make();
      const refund = await f.addExpense(household, alice, 1000, { [alice.id]: 500, [bob.id]: 500 }, "refund", { refundOfId: original.id });
      const blocked = await patch(alice, original.id, body());
      expect(blocked.status).toBe(409);
      expect(blocked.body.error.code).toBe("HAS_REFUNDS");
      await testDb.expense.update({ where: { id: refund.id }, data: { status: "reversed" } });
      expect((await patch(alice, original.id, body())).status).toBe(200);
    });

    it.each([
      ["no version", () => body({ version: undefined }), "version"],
      ["version 0", () => body({ version: 0 }), "version"],
      ["an unknown field", () => body({ status: "reversed" }), "status"],
      ["a participant who is not a member", () => body({ split: { method: "equal", participants: [alice.id, carol.id] } }), "split.participants.1"],
      ["a payer who is not a member", () => body({ paidById: carol.id }), "paidById"],
      ["an unknown category", () => body({ categoryId: "no-such-category" }), "categoryId"],
    ])("a bad body (%s) is a 400", async (_label, make400, field) => {
      const e = await make();
      const res = await patch(alice, e.id, make400());
      expect(res.status).toBe(400);
      expect(res.body.error.details.map((d) => d.field)).toContain(field);
      await unchanged(e.id);
    });

    it("splits that cannot be done are a 422", async () => {
      const e = await make();
      const split = { method: "exact", shares: [{ userId: alice.id, shareMinor: 6000 }, { userId: bob.id, shareMinor: 3000 }] };
      const res = await patch(alice, e.id, body({ split }));
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("SPLIT_MISMATCH");
      await unchanged(e.id);
    });

    it("an unknown expense is a 404", async () => {
      expect((await patch(alice, "no-such-expense", body())).status).toBe(404);
    });
  });

  it("an open dispute is settled by an edit: the expense goes back to confirmed", async () => {
    const e = await make({ status: "disputed" });
    const res = await patch(alice, e.id, body());
    expect(res.body.data.expense.status).toBe("confirmed");
  });
});
