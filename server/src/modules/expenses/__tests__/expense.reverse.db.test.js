import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";

// Real database. Skipped without TEST_DATABASE_URL.
describe.skipIf(!process.env.TEST_DATABASE_URL)("POST /expenses/:expenseId/reverse", () => {
  let app, resetDb, testDb, f;
  let alice, bob, carol, household;

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

  const reverse = (user, id, body = { reason: "Entered twice" }) =>
    request(app).post(`/api/v1/households/${household.id}/expenses/${id}/reverse`).set(f.bearer(user)).send(body);
  const make = (payer = alice, amount = 10000, extra = {}) =>
    f.addExpense(household, payer, amount, { [alice.id]: amount / 2, [bob.id]: amount / 2 }, "shared", extra);
  const row = (id) => testDb.expense.findUnique({ where: { id }, include: { splits: true } });
  const events = (id) => testDb.auditEvent.findMany({ where: { entityId: id, action: "expense.reversed" } });

  it("marks it reversed, keeps the row and its splits, and records why", async () => {
    const e = await make();
    const res = await reverse(alice, e.id, { reason: "  Entered twice " });
    expect(res.status).toBe(200);
    expect(res.body.data.expense).toMatchObject({ status: "reversed", version: 2 });

    const stored = await row(e.id);
    expect(stored.status).toBe("reversed");
    expect(stored.splits).toHaveLength(2); // nothing is deleted

    const [event] = await events(e.id);
    expect(event).toMatchObject({ actorUserId: alice.id, reason: "Entered twice", requestId: res.headers["x-request-id"] });
    expect(event.before).toMatchObject({ status: "confirmed", version: 1 });
    expect(event.after).toMatchObject({ status: "reversed", version: 2 });
  });

  it("makes the balance equal the ledger without that expense", async () => {
    const kept = await make(alice, 10000); // alice paid: +5000 / -5000
    const mistake = await make(alice, 4000, { paidById: bob.id }); // alice recorded it, bob paid: alice -2000 / bob +2000
    expect(await f.balancesOf(household, [alice, bob])).toEqual({ [alice.id]: 3000, [bob.id]: -3000 });

    await reverse(alice, mistake.id); // alice recorded it, so she may reverse it
    expect(await f.balancesOf(household, [alice, bob])).toEqual({ [alice.id]: 5000, [bob.id]: -5000 });
    expect((await row(kept.id)).status).toBe("confirmed");
  });

  it("is safe to repeat: the second call changes nothing and writes no second event", async () => {
    const e = await make();
    await reverse(alice, e.id);
    const again = await reverse(alice, e.id);
    expect(again.status).toBe(200);
    expect(again.body.data.expense).toMatchObject({ status: "reversed", version: 2 });
    expect(await events(e.id)).toHaveLength(1);
  });

  it("two reversals at once leave one event and one version bump", async () => {
    const e = await make();
    const [a, b] = await Promise.all([reverse(alice, e.id), reverse(alice, e.id)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(await events(e.id)).toHaveLength(1);
    expect((await row(e.id)).version).toBe(2);
  });

  it("can reverse a disputed expense, and a personal one", async () => {
    const disputed = await make(alice, 10000, { status: "disputed" });
    expect((await reverse(alice, disputed.id)).body.data.expense.status).toBe("reversed");
    const personal = await f.addExpense(household, alice, 500, { [alice.id]: 500 }, "personal");
    expect((await reverse(alice, personal.id)).status).toBe(200);
  });

  it("is blocked while the expense has refunds, until they are reversed", async () => {
    const original = await make();
    const refund = await f.addExpense(household, alice, 1000, { [alice.id]: 500, [bob.id]: 500 }, "refund", { refundOfId: original.id });
    const blocked = await reverse(alice, original.id);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("HAS_REFUNDS");
    expect((await row(original.id)).status).toBe("confirmed");

    expect((await reverse(alice, refund.id)).status).toBe(200);
    expect((await reverse(alice, original.id)).status).toBe(200);
  });

  it("only the person who recorded it may reverse: a member gets 403, a stranger 404", async () => {
    const e = await make();
    expect((await reverse(bob, e.id)).status).toBe(403);
    expect((await reverse(carol, e.id)).status).toBe(404);
    expect((await request(app).post(`/api/v1/households/${household.id}/expenses/${e.id}/reverse`).send({ reason: "x" })).status).toBe(401);
    expect((await row(e.id)).status).toBe("confirmed");
    expect(await events(e.id)).toHaveLength(0);
  });

  it("someone else's personal expense is a 404", async () => {
    const theirs = await f.addExpense(household, bob, 500, { [bob.id]: 500 }, "personal");
    expect((await reverse(alice, theirs.id)).status).toBe(404);
  });

  it.each([
    ["no reason", {}],
    ["a blank reason", { reason: "   " }],
    ["a reason over 300 characters", { reason: "x".repeat(301) }],
    ["an unknown field", { reason: "ok", status: "confirmed" }],
  ])("rejects %s with a 400", async (_label, payload) => {
    const e = await make();
    const res = await reverse(alice, e.id, payload);
    expect(res.status).toBe(400);
    expect((await row(e.id)).status).toBe("confirmed");
  });

  it("an unknown expense is a 404", async () => {
    expect((await reverse(alice, "no-such-expense")).status).toBe(404);
  });
});
