import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";

// Real database. Skipped without TEST_DATABASE_URL.
describe.skipIf(!process.env.TEST_DATABASE_URL)("GET /households/:id/reports/monthly", () => {
  let app, resetDb, f, monthOf;
  let alice, bob, carol, household; // alice and bob are members, carol is a stranger

  beforeAll(async () => {
    ({ default: app } = await import("../../../app.js"));
    ({ resetDb } = await import("../../../test/db-helper.js"));
    f = await import("../../../test/factories.js");
    ({ monthOf } = await import("../report.calc.js"));
  });

  beforeEach(async () => {
    await resetDb();
    ({ users: [alice, bob, carol], household } = await f.makeWorld());
  });

  const report = (user, query = "") => request(app).get(`/api/v1/households/${household.id}/reports/monthly${query}`).set(f.bearer(user));
  const equal = (payer, amount, when, extra = {}) =>
    f.addExpense(household, payer, amount, { [alice.id]: amount / 2, [bob.id]: amount / 2 }, "shared", { occurredAt: new Date(when), ...extra });

  it("adds up the month and each person's paid and share, like the ledger", async () => {
    await equal(alice, 200000, "2026-10-10T06:00:00Z");
    await equal(bob, 120000, "2026-10-12T06:00:00Z");
    const res = await report(alice, "?month=2026-10");
    expect(res.status).toBe(200);
    const { data } = res.body;
    expect(data).toMatchObject({ month: "2026-10", timezone: "Asia/Kolkata", spendMinor: 320000, previousSpendMinor: 0 });
    const by = Object.fromEntries(data.members.map((m) => [m.userId, m]));
    expect([by[alice.id].paidMinor, by[alice.id].shareMinor]).toEqual([200000, 160000]);
    expect([by[bob.id].paidMinor, by[bob.id].shareMinor]).toEqual([120000, 160000]);
  });

  it("leaves out personal and reversed expenses", async () => {
    await equal(alice, 100000, "2026-10-10T06:00:00Z");
    await f.addExpense(household, bob, 5000, { [bob.id]: 5000 }, "personal", { occurredAt: new Date("2026-10-11T06:00:00Z") });
    await equal(alice, 70000, "2026-10-12T06:00:00Z", { status: "reversed" });
    expect((await report(bob, "?month=2026-10")).body.data.spendMinor).toBe(100000);
  });

  it("gives the previous month and six months of trend, empty months as 0", async () => {
    await equal(alice, 100000, "2026-09-15T06:00:00Z");
    await equal(alice, 60000, "2026-10-15T06:00:00Z");
    await equal(alice, 80000, "2026-11-02T06:00:00Z");
    const { data } = (await report(alice, "?month=2026-11")).body;
    expect(data.previousSpendMinor).toBe(60000);
    expect(data.trend.map((t) => t.spendMinor)).toEqual([0, 0, 0, 100000, 60000, 80000]);
  });

  it("counts 00:10 IST on 1 November as November", async () => {
    await equal(alice, 40000, "2026-10-31T18:40:00Z");
    expect((await report(alice, "?month=2026-11")).body.data.spendMinor).toBe(40000);
    expect((await report(alice, "?month=2026-10")).body.data.spendMinor).toBe(0);
  });

  it("defaults to the current month in the household's timezone", async () => {
    const res = await report(alice);
    expect(res.status).toBe(200);
    expect(res.body.data.month).toBe(monthOf(new Date(), "Asia/Kolkata"));
  });

  it("rejects a bad month or an unknown parameter", async () => {
    for (const q of ["?month=2026-13", "?month=2026-1", "?month=abc", "?month=2026-10&x=1"]) {
      expect((await report(alice, q)).status, q).toBe(400);
    }
  });

  it("gives a stranger the same 404 as a missing household, and a signed-out visitor 401", async () => {
    expect((await report(carol)).status).toBe(404);
    expect((await request(app).get(`/api/v1/households/${household.id}/reports/monthly`)).status).toBe(401);
  });
});
