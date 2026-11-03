import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";

// Talks to the repository directly, to prove the transaction rolls back as one piece.
// Real database. Skipped without TEST_DATABASE_URL.
describe.skipIf(!process.env.TEST_DATABASE_URL)("creating an expense is all or nothing", () => {
  let repository, resetDb, testDb, f;
  let alice, bob, household;

  beforeAll(async () => {
    repository = await import("../expense.repository.js");
    ({ resetDb, testDb } = await import("../../../test/db-helper.js"));
    f = await import("../../../test/factories.js");
  });

  beforeEach(async () => {
    await resetDb();
    ({ users: [alice, bob], household } = await f.makeWorld(["Alice", "Bob"]));
  });

  const expense = (overrides = {}) => ({
    id: randomUUID(),
    createdById: alice.id,
    paidById: alice.id,
    categoryId: null,
    description: "Rent",
    notes: null,
    amountMinor: 1000,
    type: "shared",
    splitMethod: "exact",
    occurredAt: new Date(),
    idempotencyKey: randomUUID(),
    requestHash: "a".repeat(64),
    splits: [{ userId: alice.id, shareMinor: 500 }, { userId: bob.id, shareMinor: 500 }],
    ...overrides,
  });
  const audit = (overrides = {}) => ({ actorUserId: alice.id, requestId: "req-1", ...overrides });
  const counts = async () => ({
    expenses: await testDb.expense.count(),
    splits: await testDb.expenseSplit.count(),
    audits: await testDb.auditEvent.count(),
  });

  it("writes the expense, its splits and its audit event together", async () => {
    const created = await repository.createExpense(household.id, expense(), audit());
    expect(created.splits).toHaveLength(2);
    expect(await counts()).toEqual({ expenses: 1, splits: 2, audits: 1 });
  });

  it("keeps nothing when the audit event cannot be written", async () => {
    await expect(repository.createExpense(household.id, expense(), audit({ actorUserId: "no-such-user" }))).rejects.toThrow();
    expect(await counts()).toEqual({ expenses: 0, splits: 0, audits: 0 });
  });

  it("keeps nothing when the splits do not add up to the amount (the database refuses the commit)", async () => {
    const lopsided = expense({ splits: [{ userId: alice.id, shareMinor: 500 }] });
    await expect(repository.createExpense(household.id, lopsided, audit())).rejects.toThrow();
    expect(await counts()).toEqual({ expenses: 0, splits: 0, audits: 0 });
  });

  it("keeps nothing when the amount is not positive (the database refuses the row)", async () => {
    const free = expense({ amountMinor: 0, splits: [{ userId: alice.id, shareMinor: 0 }] });
    await expect(repository.createExpense(household.id, free, audit())).rejects.toThrow();
    expect(await counts()).toEqual({ expenses: 0, splits: 0, audits: 0 });
  });

  it("adds nothing more when an idempotency key is used twice", async () => {
    const first = expense();
    await repository.createExpense(household.id, first, audit());
    const again = expense({ idempotencyKey: first.idempotencyKey });
    await expect(repository.createExpense(household.id, again, audit())).rejects.toMatchObject({ code: "P2002" });
    expect(await counts()).toEqual({ expenses: 1, splits: 2, audits: 1 });
  });
});
