import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";

// Real database. Skipped without TEST_DATABASE_URL.
describe.skipIf(!process.env.TEST_DATABASE_URL)("expense idempotency", () => {
  let app, resetDb, testDb, f;
  let alice, bob, household;

  beforeAll(async () => {
    ({ default: app } = await import("../../../app.js"));
    ({ resetDb, testDb } = await import("../../../test/db-helper.js"));
    f = await import("../../../test/factories.js");
  });

  beforeEach(async () => {
    await resetDb();
    alice = await f.makeUser("Alice");
    bob = await f.makeUser("Bob");
    household = await f.makeHousehold(alice);
    await f.addMember(household, bob);
  });

  const post = (user, body, key, householdId = household.id) =>
    request(app).post(`/api/v1/households/${householdId}/expenses`).set(f.bearer(user)).set("Idempotency-Key", key).send(body);
  const sharedBody = (amountMinor = 10000) => ({
    type: "shared",
    description: "Rent",
    amountMinor,
    split: { method: "equal", participants: [alice.id, bob.id] },
  });
  const personalBody = { type: "personal", description: "Headphones", amountMinor: 5000 };
  const rows = () => testDb.expense.count();

  it("answers a retry with the original result and creates nothing new", async () => {
    const key = randomUUID();
    const first = await post(alice, sharedBody(), key);
    const retry = await post(alice, sharedBody(), key);

    expect(first.status).toBe(201);
    expect(retry.status).toBe(201);
    expect(retry.body.data.expense).toEqual(first.body.data.expense);
    expect(first.headers["idempotent-replayed"]).toBeUndefined();
    expect(retry.headers["idempotent-replayed"]).toBe("true");
    expect(await rows()).toBe(1);
    expect(await testDb.expenseSplit.count()).toBe(2);
    expect(await testDb.auditEvent.count()).toBe(1);
  });

  it("recognises the same request even when its fields arrive in another order", async () => {
    const key = randomUUID();
    await post(alice, { type: "personal", description: "Headphones", amountMinor: 5000 }, key);
    const retry = await post(alice, { amountMinor: 5000, description: "Headphones", type: "personal" }, key);
    expect(retry.headers["idempotent-replayed"]).toBe("true");
    expect(await rows()).toBe(1);
  });

  it("refuses a reused key that carries a different request", async () => {
    const key = randomUUID();
    await post(alice, sharedBody(10000), key);
    const clash = await post(alice, sharedBody(20000), key);
    expect(clash.status).toBe(422);
    expect(clash.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
    expect(await rows()).toBe(1);
  });

  it("treats a key reused in another household as a different request", async () => {
    const other = await f.makeHousehold(alice, "Second flat");
    const key = randomUUID();
    expect((await post(alice, personalBody, key)).status).toBe(201);
    const clash = await post(alice, personalBody, key, other.id);
    expect(clash.status).toBe(422);
    expect(clash.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
    expect(await testDb.expense.count({ where: { householdId: other.id } })).toBe(0);
  });

  it("creates a second expense when the key is new", async () => {
    await post(alice, sharedBody(), randomUUID());
    await post(alice, sharedBody(), randomUUID());
    expect(await rows()).toBe(2);
  });

  it("keeps keys separate for each user", async () => {
    const key = randomUUID();
    const a = await post(alice, personalBody, key);
    const b = await post(bob, personalBody, key);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(b.headers["idempotent-replayed"]).toBeUndefined();
    expect(a.body.data.expense.id).not.toBe(b.body.data.expense.id);
    expect(await rows()).toBe(2);
  });

  it("makes exactly one expense when the same request arrives twice at once", async () => {
    const key = randomUUID();
    const [one, two] = await Promise.all([post(alice, sharedBody(), key), post(alice, sharedBody(), key)]);
    expect([one.status, two.status]).toEqual([201, 201]);
    expect(one.body.data.expense.id).toBe(two.body.data.expense.id);
    expect([one, two].filter((r) => r.headers["idempotent-replayed"] === "true")).toHaveLength(1);
    expect(await rows()).toBe(1);
    expect(await testDb.expenseSplit.count()).toBe(2);
    expect(await testDb.auditEvent.count()).toBe(1);
  });

  it("makes exactly one expense when a double tap fires five requests at once", async () => {
    const key = randomUUID();
    const results = await Promise.all(Array.from({ length: 5 }, () => post(alice, sharedBody(), key)));
    expect(new Set(results.map((r) => r.status))).toEqual(new Set([201]));
    expect(new Set(results.map((r) => r.body.data.expense.id)).size).toBe(1);
    expect(await rows()).toBe(1);
    expect(await testDb.auditEvent.count()).toBe(1);
  });
});
