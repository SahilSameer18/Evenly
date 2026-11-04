import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";

// Real database. Skipped without TEST_DATABASE_URL.
describe.skipIf(!process.env.TEST_DATABASE_URL)("balances, ledger and settlement suggestions", () => {
  let app, resetDb, testDb, f;
  let alice, bob, carol, household; // alice and bob are members, carol is a stranger

  beforeAll(async () => {
    ({ default: app } = await import("../../../app.js"));
    ({ resetDb, testDb } = await import("../../../test/db-helper.js"));
    f = await import("../../../test/factories.js");
  });

  beforeEach(async () => {
    await resetDb();
    ({ users: [alice, bob, carol], household } = await f.makeWorld());
  });

  const base = () => `/api/v1/households/${household.id}`;
  const get = (user, path) => request(app).get(`${base()}${path}`).set(f.bearer(user));
  const spend = (user, description, amountMinor, extra = {}) =>
    request(app)
      .post(`${base()}/expenses`)
      .set(f.bearer(user))
      .set("Idempotency-Key", randomUUID())
      .send({ type: "shared", description, amountMinor, split: { method: "equal", participants: [alice.id, bob.id] }, ...extra });
  const repay = (user, toUserId, amountMinor) =>
    request(app).post(`${base()}/settlements`).set(f.bearer(user)).set("Idempotency-Key", randomUUID()).send({ toUserId, amountMinor, method: "upi" });
  const confirm = (user, id) => request(app).post(`${base()}/settlements/${id}/confirm`).set(f.bearer(user)).send({});
  const nets = async (user = alice) => Object.fromEntries((await get(user, "/balances")).body.data.members.map((m) => [m.userId, m.netMinor]));

  // The blueprint's worked example, in paise, recorded through the API.
  const recordWorkedExample = async () => {
    await spend(alice, "Groceries", 200000);
    await spend(bob, "Electricity", 120000);
    await spend(bob, "Wifi", 80000);
    await spend(alice, "Item", 60000);
  };

  describe("the worked example from the blueprint", () => {
    it("reproduces +300 / -300 rupees through the API", async () => {
      await recordWorkedExample();
      expect(await nets()).toEqual({ [alice.id]: 30000, [bob.id]: -30000 });
    });

    it("is unchanged by someone's personal expense and by a pending repayment", async () => {
      await recordWorkedExample();
      await spend(bob, "Chai", 500, { type: "personal", split: undefined });
      await repay(bob, alice.id, 20000);
      expect(await nets()).toEqual({ [alice.id]: 30000, [bob.id]: -30000 });
    });

    it("moves to +100 / -100 when the 200 rupee repayment is confirmed", async () => {
      await recordWorkedExample();
      const s = (await repay(bob, alice.id, 20000)).body.data.settlement;
      const res = await confirm(alice, s.id);
      expect(res.body.data.balanceAfter).toEqual({ [alice.id]: 10000, [bob.id]: -10000 });
      expect(await nets()).toEqual({ [alice.id]: 10000, [bob.id]: -10000 });
    });

    it("flips the direction when the repayment is bigger than the debt", async () => {
      await recordWorkedExample();
      const s = (await repay(bob, alice.id, 40000)).body.data.settlement;
      await confirm(alice, s.id);
      expect(await nets()).toEqual({ [alice.id]: -10000, [bob.id]: 10000 });
    });

    it("is cleared by following the suggestion", async () => {
      await recordWorkedExample();
      const { suggestions } = (await get(alice, "/settlement-suggestions")).body.data;
      expect(suggestions).toEqual([
        { from: { userId: bob.id, name: "Bob", active: true }, to: { userId: alice.id, name: "Alice", active: true }, amountMinor: 30000 },
      ]);
      const s = (await repay(bob, alice.id, suggestions[0].amountMinor)).body.data.settlement;
      await confirm(alice, s.id);
      expect(await nets()).toEqual({ [alice.id]: 0, [bob.id]: 0 });
      expect((await get(bob, "/settlement-suggestions")).body.data.suggestions).toEqual([]);
      expect((await get(bob, "/balances")).body.data.settledUp).toBe(true);
    });
  });

  describe("GET /balances", () => {
    it("shows the formula parts, names and whether each person is still in", async () => {
      await f.addExpense(household, alice, 10000, { [alice.id]: 5000, [bob.id]: 5000 });
      await f.addRepayment(household, bob, alice, 2000);
      const res = await get(bob, "/balances");
      expect(res.status).toBe(200);
      expect(res.body.data.settledUp).toBe(false);
      expect(res.body.data.members).toEqual([
        { userId: alice.id, name: "Alice", active: true, paidMinor: 10000, shareMinor: 5000, sentMinor: 0, receivedMinor: 2000, netMinor: 3000 },
        { userId: bob.id, name: "Bob", active: true, paidMinor: 0, shareMinor: 5000, sentMinor: 2000, receivedMinor: 0, netMinor: -3000 },
      ]);
    });

    it("keeps a former member in the list, after the active ones", async () => {
      await f.addExpense(household, alice, 10000, { [alice.id]: 5000, [bob.id]: 5000 });
      await f.addRepayment(household, bob, alice, 5000);
      await testDb.householdMember.updateMany({ where: { householdId: household.id, userId: bob.id }, data: { status: "left", leftAt: new Date() } });
      const { members } = (await get(alice, "/balances")).body.data;
      expect(members.map((m) => [m.name, m.active, m.netMinor])).toEqual([["Alice", true, 0], ["Bob", false, 0]]);
    });

    it("is all zero for a new household", async () => {
      const res = await get(alice, "/balances");
      expect(res.body.data.settledUp).toBe(true);
      expect(res.body.data.members.every((m) => m.netMinor === 0)).toBe(true);
    });

    it("leaves out a reversed expense and every personal one", async () => {
      const e = await f.addExpense(household, alice, 10000, { [alice.id]: 5000, [bob.id]: 5000 }, "shared", { status: "reversed" });
      await f.addExpense(household, bob, 700, { [bob.id]: 700 }, "personal");
      expect(await nets()).toEqual({ [alice.id]: 0, [bob.id]: 0 });
      expect(e.status).toBe("reversed");
    });
  });

  describe("GET /ledger", () => {
    it("lists entries oldest first with every member's balance after each one", async () => {
      await recordWorkedExample();
      const s = (await repay(bob, alice.id, 20000)).body.data.settlement;
      await confirm(alice, s.id);

      const res = await get(bob, "/ledger");
      expect(res.status).toBe(200);
      const { entries, members } = res.body.data;
      expect(members.map((m) => m.name).sort()).toEqual(["Alice", "Bob"]);
      expect(entries.map((e) => e.label)).toEqual(["Groceries", "Electricity", "Wifi", "Item", "Repayment (upi)"]);
      expect(entries.map((e) => e.kind)).toEqual(["expense", "expense", "expense", "expense", "repayment"]);
      expect(entries[0].running).toEqual({ [alice.id]: 100000, [bob.id]: -100000 });
      expect(entries[1].running).toEqual({ [alice.id]: 40000, [bob.id]: -40000 });
      expect(entries.at(-1)).toMatchObject({ counted: true, deltas: { [alice.id]: -20000, [bob.id]: 20000 }, running: { [alice.id]: 10000, [bob.id]: -10000 } });
    });

    it("shows a pending repayment as not counted, with no change", async () => {
      await spend(alice, "Rent", 10000);
      await repay(bob, alice.id, 3000);
      const { entries } = (await get(alice, "/ledger")).body.data;
      expect(entries.at(-1)).toMatchObject({ kind: "repayment", status: "pending", counted: false, deltas: { [alice.id]: 0, [bob.id]: 0 } });
      expect(entries.at(-1).running).toEqual({ [alice.id]: 5000, [bob.id]: -5000 });
    });

    it("never contains a personal expense", async () => {
      await f.addExpense(household, bob, 700, { [bob.id]: 700 }, "personal", { description: "Secret" });
      const res = await get(alice, "/ledger");
      expect(res.body.data.entries).toEqual([]);
      expect(JSON.stringify(res.body)).not.toContain("Secret");
    });
  });

  describe("access", () => {
    it.each(["/balances", "/ledger", "/settlement-suggestions"])("%s: a stranger gets 404 and nobody gets 401", async (path) => {
      expect((await get(carol, path)).status).toBe(404);
      expect((await request(app).get(`${base()}${path}`)).status).toBe(401);
    });
  });

  describe("balanceAfter on creating an expense", () => {
    it("returns every member's new balance next to the expense, also on a replay", async () => {
      const key = randomUUID();
      const send = () =>
        request(app)
          .post(`${base()}/expenses`)
          .set(f.bearer(alice))
          .set("Idempotency-Key", key)
          .send({ type: "shared", description: "Rent", amountMinor: 10000, split: { method: "equal", participants: [alice.id, bob.id] } });
      const first = await send();
      expect(first.status).toBe(201);
      expect(first.body.data.expense).toMatchObject({ description: "Rent", amountMinor: 10000 });
      expect(first.body.data.balanceAfter).toEqual({ [alice.id]: 5000, [bob.id]: -5000 });

      const again = await send();
      expect(again.headers["idempotent-replayed"]).toBe("true");
      expect(again.body.data.expense.id).toBe(first.body.data.expense.id);
      expect(again.body.data.balanceAfter).toEqual({ [alice.id]: 5000, [bob.id]: -5000 });
    });
  });
});
