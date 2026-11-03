import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";

// Real database. Skipped without TEST_DATABASE_URL.
describe.skipIf(!process.env.TEST_DATABASE_URL)("POST /api/v1/households/:householdId/expenses", () => {
  let app, resetDb, testDb, f, calculateMemberBalances;
  let alice, bob, carol, household; // alice owns it, bob is a member, carol is a stranger

  beforeAll(async () => {
    ({ default: app } = await import("../../../app.js"));
    ({ resetDb, testDb } = await import("../../../test/db-helper.js"));
    ({ calculateMemberBalances } = await import("../../../ledger/index.js"));
    f = await import("../../../test/factories.js");
  });

  beforeEach(async () => {
    await resetDb();
    ({ users: [alice, bob, carol], household } = await f.makeWorld());
  });

  // key === null sends no Idempotency-Key header at all.
  const post = (user, body, { key = randomUUID(), householdId = household.id } = {}) => {
    const req = request(app).post(`/api/v1/households/${householdId}/expenses`).set(f.bearer(user));
    return (key === null ? req : req.set("Idempotency-Key", key)).send(body);
  };
  const shared = (overrides = {}) => ({
    type: "shared",
    description: "Groceries",
    amountMinor: 10000,
    split: { method: "equal", participants: [alice.id, bob.id] },
    ...overrides,
  });
  const shareOf = (expense, user) => expense.splits.find((s) => s.userId === user.id)?.shareMinor;
  const counts = async () => ({
    expenses: await testDb.expense.count(),
    splits: await testDb.expenseSplit.count(),
    audits: await testDb.auditEvent.count(),
  });

  describe("shared expenses, by split method", () => {
    it("equal: an uneven total splits to the paisa and adds up", async () => {
      const res = await post(alice, shared({ amountMinor: 10001 }));
      expect(res.status).toBe(201);
      const { expense } = res.body.data;
      expect(expense.splits.map((s) => s.shareMinor).sort()).toEqual([5000, 5001]);
      expect(expense).toMatchObject({ splitMethod: "equal", type: "shared", status: "confirmed", version: 1, paidById: alice.id, createdById: alice.id });
    });

    it("equal: only the named participants share it, and the payer need not be one of them", async () => {
      const res = await post(alice, shared({ split: { method: "equal", participants: [bob.id] } }));
      expect(res.body.data.expense.splits).toEqual([{ userId: bob.id, shareMinor: 10000 }]);
    });

    it("exact: uses the amounts given", async () => {
      const res = await post(alice, shared({ split: { method: "exact", shares: [{ userId: alice.id, shareMinor: 7000 }, { userId: bob.id, shareMinor: 3000 }] } }));
      expect(res.status).toBe(201);
      expect([shareOf(res.body.data.expense, alice), shareOf(res.body.data.expense, bob)]).toEqual([7000, 3000]);
    });

    it("percentage: 60/40 of an odd total gives the extra paisa to the larger remainder", async () => {
      const res = await post(alice, shared({ amountMinor: 10001, split: { method: "percentage", parts: [{ userId: alice.id, bps: 6000 }, { userId: bob.id, bps: 4000 }] } }));
      expect([shareOf(res.body.data.expense, alice), shareOf(res.body.data.expense, bob)]).toEqual([6001, 4000]);
    });

    it("weights: 2:1:1 across three members", async () => {
      const dave = await f.makeUser("Dave");
      await f.addMember(household, dave);
      const res = await post(alice, shared({ amountMinor: 10001, split: { method: "weights", parts: [{ userId: alice.id, weight: 2 }, { userId: bob.id, weight: 1 }, { userId: dave.id, weight: 1 }] } }));
      expect(res.status).toBe(201);
      expect([shareOf(res.body.data.expense, alice), shareOf(res.body.data.expense, bob), shareOf(res.body.data.expense, dave)]).toEqual([5001, 2500, 2500]);
    });
  });

  describe("who paid", () => {
    it("defaults to the person making the request", async () => {
      expect((await post(bob, shared())).body.data.expense).toMatchObject({ paidById: bob.id, createdById: bob.id });
    });

    it("can be another member: alice records what bob paid", async () => {
      const { expense } = (await post(alice, shared({ paidById: bob.id }))).body.data;
      expect(expense).toMatchObject({ paidById: bob.id, createdById: alice.id });
    });
  });

  describe("the stored result", () => {
    it("has the documented shape and never exposes the idempotency fields", async () => {
      const { expense } = (await post(alice, shared({ notes: "  weekly shop ", occurredAt: "2026-10-30T14:20:00+05:30" }))).body.data;
      expect(Object.keys(expense).sort()).toEqual(
        ["amountMinor", "categoryId", "createdAt", "createdById", "description", "householdId", "id", "notes", "occurredAt", "paidById", "refundOfId", "splitMethod", "splits", "status", "type", "version"],
      );
      expect(expense).toMatchObject({ notes: "weekly shop", occurredAt: "2026-10-30T08:50:00.000Z", householdId: household.id });
    });

    it("defaults the date to now", async () => {
      const before = Date.now();
      const { expense } = (await post(alice, shared())).body.data;
      expect(new Date(expense.occurredAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
      expect(new Date(expense.occurredAt).getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    });

    it("stores the key and a 64-character request hash on the row", async () => {
      const key = randomUUID();
      const { expense } = (await post(alice, shared(), { key })).body.data;
      const row = await testDb.expense.findUnique({ where: { id: expense.id } });
      expect(row.idempotencyKey).toBe(key);
      expect(row.requestHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("writes one audit event with the request id and a snapshot of what was saved", async () => {
      const res = await post(alice, shared());
      const { expense } = res.body.data;
      const events = await testDb.auditEvent.findMany({ where: { entityId: expense.id } });
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ householdId: household.id, actorUserId: alice.id, entityType: "expense", action: "expense.created", requestId: res.headers["x-request-id"] });
      expect(events[0].after).toMatchObject({ amountMinor: 10000, type: "shared", paidById: alice.id, splits: expense.splits });
    });

    it("uses a category from this household or a system category", async () => {
      const mine = await testDb.category.create({ data: { householdId: household.id, name: "Groceries" } });
      const system = await testDb.category.create({ data: { householdId: null, name: "Rent" } });
      expect((await post(alice, shared({ categoryId: mine.id }))).body.data.expense.categoryId).toBe(mine.id);
      expect((await post(alice, shared({ categoryId: system.id }))).body.data.expense.categoryId).toBe(system.id);
    });
  });

  describe("personal and on-behalf expenses", () => {
    it("personal: a single 100% share for the person who paid", async () => {
      const { expense } = (await post(bob, { type: "personal", description: "Headphones", amountMinor: 150000 })).body.data;
      expect(expense).toMatchObject({ type: "personal", paidById: bob.id, splitMethod: "exact" });
      expect(expense.splits).toEqual([{ userId: bob.id, shareMinor: 150000 }]);
    });

    it("on behalf: the beneficiary owes 100%", async () => {
      const { expense } = (await post(alice, { type: "on_behalf", description: "Medicine", amountMinor: 60000, beneficiaryId: bob.id })).body.data;
      expect(expense).toMatchObject({ type: "on_behalf", paidById: alice.id });
      expect(expense.splits).toEqual([{ userId: bob.id, shareMinor: 60000 }]);
    });

    it("on behalf: someone else can be the payer, as long as the beneficiary is a different person", async () => {
      const { expense } = (await post(alice, { type: "on_behalf", description: "Medicine", amountMinor: 500, paidById: bob.id, beneficiaryId: alice.id })).body.data;
      expect(expense).toMatchObject({ paidById: bob.id });
      expect(expense.splits).toEqual([{ userId: alice.id, shareMinor: 500 }]);
    });

    it("the real ledger ignores personal spending and credits the payer for on-behalf", async () => {
      await post(alice, shared({ amountMinor: 200000 })); // alice paid, 100000 each
      await post(alice, { type: "personal", description: "Headphones", amountMinor: 150000 });
      await post(alice, { type: "on_behalf", description: "Medicine", amountMinor: 60000, beneficiaryId: bob.id });

      const rows = await testDb.expense.findMany({ where: { householdId: household.id }, include: { splits: true } });
      const net = calculateMemberBalances({
        memberIds: [alice.id, bob.id],
        settlements: [],
        expenses: rows.map((e) => ({ paidBy: e.paidById, amountMinor: e.amountMinor, type: e.type, status: e.status, splits: e.splits.map((s) => ({ userId: s.userId, shareMinor: s.shareMinor })) })),
      });
      expect(net).toEqual({ [alice.id]: 160000, [bob.id]: -160000 }); // +200000 -100000 +60000, bob the mirror
    });
  });

  describe("rejections leave nothing behind", () => {
    const outsiderCategory = async () => {
      const other = await f.makeHousehold(carol, "Carol's flat");
      return (await testDb.category.create({ data: { householdId: other.id, name: "Hers" } })).id;
    };

    it.each([
      ["a zero amount", () => shared({ amountMinor: 0 }), "amountMinor"],
      ["a negative amount", () => shared({ amountMinor: -5 }), "amountMinor"],
      ["a fractional amount", () => shared({ amountMinor: 10.5 }), "amountMinor"],
      ["an amount over the cap", () => shared({ amountMinor: 1_000_000_001 }), "amountMinor"],
      ["a blank description", () => shared({ description: "  " }), "description"],
      ["a date in the future", () => shared({ occurredAt: new Date(Date.now() + 86_400_000).toISOString() }), "occurredAt"],
      ["a date that is not ISO", () => shared({ occurredAt: "yesterday" }), "occurredAt"],
      ["an unknown field", () => shared({ status: "reversed" }), "status"],
      ["no type", () => shared({ type: undefined }), "type"],
      ["a shared expense with no split", () => shared({ split: undefined }), "split"],
      ["a personal expense with a split", () => ({ type: "personal", description: "x", amountMinor: 1, split: shared().split }), "split"],
      ["a personal expense naming a payer", () => ({ type: "personal", description: "x", amountMinor: 1, paidById: "someone" }), "paidById"],
      ["an on-behalf expense with no beneficiary", () => ({ type: "on_behalf", description: "x", amountMinor: 1 }), "beneficiaryId"],
      ["a participant who is not a member", () => shared({ split: { method: "equal", participants: [alice.id, carol.id] } }), "split.participants.1"],
      ["a payer who is not a member", () => shared({ paidById: carol.id }), "paidById"],
      ["a beneficiary who is not a member", () => ({ type: "on_behalf", description: "x", amountMinor: 1, beneficiaryId: carol.id }), "beneficiaryId"],
      ["a beneficiary who is also the payer", () => ({ type: "on_behalf", description: "x", amountMinor: 1, beneficiaryId: alice.id }), "beneficiaryId"],
      ["a category that does not exist", () => shared({ categoryId: "no-such-category" }), "categoryId"],
    ])("rejects %s with a 400 naming the field", async (_label, body, field) => {
      const res = await post(alice, body());
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
      expect(res.body.error.details.map((d) => d.field)).toContain(field);
      expect(await counts()).toEqual({ expenses: 0, splits: 0, audits: 0 });
    });

    it("rejects another household's category", async () => {
      const res = await post(alice, shared({ categoryId: await outsiderCategory() }));
      expect(res.status).toBe(400);
      expect(res.body.error.details.map((d) => d.field)).toContain("categoryId");
    });

    it.each([
      ["exact shares that do not add up", () => shared({ split: { method: "exact", shares: [{ userId: alice.id, shareMinor: 6000 }, { userId: bob.id, shareMinor: 3000 }] } }), "SPLIT_MISMATCH"],
      ["basis points that do not total 10000", () => shared({ split: { method: "percentage", parts: [{ userId: alice.id, bps: 5000 }, { userId: bob.id, bps: 4000 }] } }), "BPS_SUM_INVALID"],
      ["a zero weight", () => shared({ split: { method: "weights", parts: [{ userId: alice.id, weight: 0 }, { userId: bob.id, weight: 1 }] } }), "SPLIT_INVALID_WEIGHT"],
      ["the same person twice", () => shared({ split: { method: "equal", participants: [bob.id, bob.id] } }), "SPLIT_DUPLICATE_USER"],
    ])("rejects %s with a 422 and the ledger's code", async (_label, body, code) => {
      const res = await post(alice, body());
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe(code);
      expect(await counts()).toEqual({ expenses: 0, splits: 0, audits: 0 });
    });

    it.each([
      ["no Idempotency-Key", null],
      ["a key that is too short", "short"],
      ["a key with spaces", "has spaces in it!"],
      ["a key that is too long", "k".repeat(65)],
    ])("rejects %s with a 400", async (_label, key) => {
      const res = await post(alice, shared(), { key });
      expect(res.status).toBe(400);
      expect(res.body.error.details.map((d) => d.field)).toContain("Idempotency-Key");
      expect(await counts()).toEqual({ expenses: 0, splits: 0, audits: 0 });
    });
  });

  describe("who may create", () => {
    it("any active member can", async () => {
      expect((await post(bob, shared())).status).toBe(201);
    });

    it("a stranger gets 404 and nothing is created", async () => {
      const res = await post(carol, shared());
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
      expect(await counts()).toEqual({ expenses: 0, splits: 0, audits: 0 });
    });

    it("a member who left gets 404", async () => {
      await testDb.householdMember.updateMany({ where: { householdId: household.id, userId: bob.id }, data: { status: "left", leftAt: new Date() } });
      expect((await post(bob, shared())).status).toBe(404);
    });

    it("nobody gets 401", async () => {
      const res = await request(app).post(`/api/v1/households/${household.id}/expenses`).set("Idempotency-Key", randomUUID()).send(shared());
      expect(res.status).toBe(401);
    });
  });
});
