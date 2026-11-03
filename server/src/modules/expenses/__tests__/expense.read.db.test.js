import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";

// Real database. Skipped without TEST_DATABASE_URL.
describe.skipIf(!process.env.TEST_DATABASE_URL)("reading expenses: list and detail", () => {
  let app, resetDb, testDb, f;
  let alice, bob, carol, household; // alice owns it, bob is a member, carol is a stranger
  // Carol's own household, built only by the tests that need it.
  const elsewhere = () => f.makeHousehold(carol, "Carol's flat");

  beforeAll(async () => {
    ({ default: app } = await import("../../../app.js"));
    ({ resetDb, testDb } = await import("../../../test/db-helper.js"));
    f = await import("../../../test/factories.js");
  });

  beforeEach(async () => {
    await resetDb();
    ({ users: [alice, bob, carol], household } = await f.makeWorld());
  });

  const days = (n) => new Date(Date.now() - n * 86_400_000);
  const even = (amount) => ({ [alice.id]: amount / 2, [bob.id]: amount / 2 });
  const insert = (payer, extra = {}, amount = 1000, type = "shared") =>
    f.addExpense(household, payer, amount, type === "shared" ? even(amount) : { [payer.id]: amount }, type, extra);
  const list = (user, query = {}, householdId = household.id) =>
    request(app).get(`/api/v1/households/${householdId}/expenses`).set(f.bearer(user)).query(query);
  const detail = (user, id, householdId = household.id) =>
    request(app).get(`/api/v1/households/${householdId}/expenses/${id}`).set(f.bearer(user));
  const names = (res) => res.body.data.expenses.map((e) => e.description).sort();
  // The order the database itself uses, so the test checks paging, not collation.
  const dbOrder = async () => (await testDb.expense.findMany({ orderBy: [{ occurredAt: "desc" }, { id: "desc" }] })).map((e) => e.id);

  describe("GET /expenses (list)", () => {
    it("pages through everything with no gaps and no repeats, even when dates tie", async () => {
      const tie = days(3);
      const dates = [days(1), days(2), tie, tie, tie, days(4), days(5)];
      for (const [i, occurredAt] of dates.entries()) await insert(alice, { description: `E${i}`, occurredAt });

      const seen = [];
      const sizes = [];
      let cursor;
      do {
        const res = await list(bob, { limit: 3, ...(cursor && { cursor }) });
        expect(res.status).toBe(200);
        expect(res.body.meta.pagination.limit).toBe(3);
        seen.push(...res.body.data.expenses.map((e) => e.id));
        sizes.push(res.body.data.expenses.length);
        cursor = res.body.meta.pagination.nextCursor;
      } while (cursor);

      expect(sizes).toEqual([3, 3, 1]);
      expect(seen).toEqual(await dbOrder());
      expect(new Set(seen).size).toBe(7);
    });

    it("says there is no next page when the results end exactly on a page", async () => {
      await insert(alice, { occurredAt: days(1) });
      await insert(alice, { occurredAt: days(2) });
      const res = await list(bob, { limit: 2 });
      expect(res.body.data.expenses).toHaveLength(2);
      expect(res.body.meta.pagination.nextCursor).toBeNull();
    });

    it("lists newest first by default, 25 at a time, and returns an empty list for an empty household", async () => {
      expect((await list(bob)).body.data.expenses).toEqual([]);
      for (let i = 0; i < 3; i++) await insert(alice, { description: `E${i}`, occurredAt: days(i + 1) });
      const res = await list(bob);
      expect(res.body.data.expenses.map((e) => e.description)).toEqual(["E0", "E1", "E2"]);
      expect(res.body.meta.pagination.limit).toBe(25);
    });

    describe("filters", () => {
      let groceries, utilities;
      beforeEach(async () => {
        groceries = await testDb.category.create({ data: { householdId: household.id, name: "Groceries" } });
        utilities = await testDb.category.create({ data: { householdId: household.id, name: "Utilities" } });
        await insert(alice, { description: "Groceries from Big Bazaar", categoryId: groceries.id, occurredAt: days(10) });
        await insert(bob, { description: "Electricity", categoryId: utilities.id, notes: "October BILL", occurredAt: days(5) });
        await insert(alice, { description: "Medicine", occurredAt: days(2) }, 600, "on_behalf");
        await insert(alice, { description: "Headphones", occurredAt: days(1) }, 1500, "personal");
        await insert(bob, { description: "Old lamp", status: "reversed", occurredAt: days(7) });
      });

      it("by payer", async () => expect(names(await list(alice, { paidById: bob.id }))).toEqual(["Electricity", "Old lamp"]));
      it("by category", async () => expect(names(await list(alice, { categoryId: groceries.id }))).toEqual(["Groceries from Big Bazaar"]));
      it("by type", async () => expect(names(await list(alice, { type: "on_behalf" }))).toEqual(["Medicine"]));
      it("by status (reversed ones show up by default too)", async () => {
        expect(names(await list(alice, { status: "reversed" }))).toEqual(["Old lamp"]);
        expect(names(await list(alice))).toHaveLength(5);
      });
      it("by text in the description, ignoring case", async () => expect(names(await list(alice, { q: "BAZAAR" }))).toEqual(["Groceries from Big Bazaar"]));
      it("by text in the notes", async () => expect(names(await list(alice, { q: "october bill" }))).toEqual(["Electricity"]));
      it("by date range, including both ends", async () => {
        const row = await testDb.expense.findFirst({ where: { description: "Electricity" } });
        const inside = await list(alice, { from: days(6).toISOString(), to: days(1.5).toISOString() });
        expect(names(inside)).toEqual(["Electricity", "Medicine"]);
        const exact = await list(alice, { from: row.occurredAt.toISOString(), to: row.occurredAt.toISOString() });
        expect(names(exact)).toEqual(["Electricity"]);
      });
      it("combined, so every filter must match", async () => {
        expect(names(await list(alice, { paidById: alice.id, type: "shared" }))).toEqual(["Groceries from Big Bazaar"]);
        expect(names(await list(alice, { paidById: bob.id, categoryId: groceries.id }))).toEqual([]);
      });
    });

    describe("validation", () => {
      it.each([
        ["limit 0", { limit: 0 }, "limit"],
        ["limit 101", { limit: 101 }, "limit"],
        ["a limit that is not a number", { limit: "many" }, "limit"],
        ["an unknown parameter", { sort: "asc" }, "sort"],
        ["a date that is not ISO", { from: "last week" }, "from"],
        ["a bad type", { type: "gift" }, "type"],
        ["a cursor we never issued", { cursor: "garbage" }, "cursor"],
        ["a well-formed cursor of the wrong shape", { cursor: Buffer.from(JSON.stringify({ t: "x", id: 1 })).toString("base64url") }, "cursor"],
      ])("rejects %s with a 400", async (_label, query, field) => {
        const res = await list(bob, query);
        expect(res.status).toBe(400);
        expect(res.body.error.details.map((d) => d.field)).toContain(field);
      });
    });
  });

  describe("personal expenses are private", () => {
    let personal;
    beforeEach(async () => {
      personal = await insert(alice, { description: "Headphones" }, 1500, "personal");
      await insert(alice, { description: "Groceries" });
    });

    it("the creator sees it in the list and in detail", async () => {
      expect(names(await list(alice))).toEqual(["Groceries", "Headphones"]);
      expect((await detail(alice, personal.id)).status).toBe(200);
    });

    it("another member never sees it in the list", async () => {
      expect(names(await list(bob))).toEqual(["Groceries"]);
    });

    it("another member cannot find it with any filter", async () => {
      for (const query of [{ type: "personal" }, { paidById: alice.id }, { q: "Headphones" }, { status: "confirmed", limit: 100 }]) {
        expect(names(await list(bob, query))).not.toContain("Headphones");
      }
    });

    it("another member gets the same 404 as for an id that does not exist", async () => {
      const real = await detail(bob, personal.id);
      const fake = await detail(bob, "no-such-expense");
      expect(real.status).toBe(404);
      expect({ status: real.status, error: real.body.error }).toEqual({ status: fake.status, error: fake.body.error });
    });

    it("shared and on-behalf expenses stay visible to everyone in the household", async () => {
      await insert(alice, { description: "Medicine" }, 600, "on_behalf");
      expect(names(await list(bob))).toEqual(["Groceries", "Medicine"]);
    });
  });

  describe("GET /expenses/:expenseId (detail)", () => {
    it("returns the expense with its splits, matching the list", async () => {
      const row = await insert(alice, { description: "Rent" }, 2000);
      const res = await detail(bob, row.id);
      expect(res.status).toBe(200);
      const { expense } = res.body.data;
      expect(expense).toMatchObject({ id: row.id, description: "Rent", amountMinor: 2000, paidById: alice.id, householdId: household.id });
      expect(expense.splits).toHaveLength(2);
      expect(expense.splits.reduce((sum, s) => sum + s.shareMinor, 0)).toBe(2000);
      expect((await list(bob)).body.data.expenses[0]).toEqual(expense);
    });

    it("never exposes the idempotency fields", async () => {
      const row = await insert(alice, { idempotencyKey: "secret-key-1234", requestHash: "b".repeat(64) });
      const text = JSON.stringify([(await detail(bob, row.id)).body, (await list(bob)).body]);
      expect(text).not.toContain("secret-key-1234");
      expect(text).not.toContain("b".repeat(64));
      expect(text).not.toMatch(/requestHash|idempotencyKey/);
    });

    it("returns 404 for an id that does not exist", async () => {
      const res = await detail(bob, "no-such-expense");
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    });

    it("returns 404 for another household's expense, even through your own household's URL", async () => {
      const other = await elsewhere();
      const hers = await f.addExpense(other, carol, 800, { [carol.id]: 800 });
      expect((await detail(alice, hers.id)).status).toBe(404);
      expect((await detail(carol, hers.id, other.id)).status).toBe(200);
    });
  });

  describe("who may read", () => {
    let row;
    beforeEach(async () => {
      row = await insert(alice);
    });

    it("a stranger gets 404 on the list and on detail", async () => {
      expect((await list(carol)).status).toBe(404);
      expect((await detail(carol, row.id)).status).toBe(404);
    });

    it("a stranger sees nothing of another household by guessing its id", async () => {
      expect((await list(bob, {}, (await elsewhere()).id)).status).toBe(404);
    });

    it("a member who left gets 404", async () => {
      await testDb.householdMember.updateMany({ where: { householdId: household.id, userId: bob.id }, data: { status: "left", leftAt: new Date() } });
      expect((await list(bob)).status).toBe(404);
      expect((await detail(bob, row.id)).status).toBe(404);
    });

    it("nobody gets 401", async () => {
      expect((await request(app).get(`/api/v1/households/${household.id}/expenses`)).status).toBe(401);
      expect((await request(app).get(`/api/v1/households/${household.id}/expenses/${row.id}`)).status).toBe(401);
    });
  });
});
