import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";

// Real database. Skipped without TEST_DATABASE_URL.
describe.skipIf(!process.env.TEST_DATABASE_URL)("POST /settlements and the reads", () => {
  let app, resetDb, testDb, f;
  let alice, bob, carol, household; // alice owns it, bob is a member, carol is a stranger

  beforeAll(async () => {
    ({ default: app } = await import("../../../app.js"));
    ({ resetDb, testDb } = await import("../../../test/db-helper.js"));
    f = await import("../../../test/factories.js");
  });

  beforeEach(async () => {
    await resetDb();
    ({ users: [alice, bob, carol], household } = await f.makeWorld());
  });

  const url = (path = "") => `/api/v1/households/${household.id}/settlements${path}`;
  const pay = (user, body, key = randomUUID()) => {
    const req = request(app).post(url()).set(f.bearer(user));
    return (key ? req.set("Idempotency-Key", key) : req).send(body);
  };
  const valid = () => ({ toUserId: alice.id, amountMinor: 20000, method: "upi" });
  const events = (id) => testDb.auditEvent.findMany({ where: { entityId: id, entityType: "settlement" } });

  it("records a pending repayment from the caller and writes one audit event", async () => {
    const res = await pay(bob, { ...valid(), paymentReference: " UPI-1 ", note: "rent share" });
    expect(res.status).toBe(201);
    const { settlement } = res.body.data;
    expect(settlement).toMatchObject({
      householdId: household.id,
      fromUserId: bob.id,
      toUserId: alice.id,
      createdById: bob.id,
      amountMinor: 20000,
      method: "upi",
      paymentReference: "UPI-1",
      note: "rent share",
      status: "pending",
      confirmedAt: null,
      resolvedAt: null,
    });
    expect(settlement).not.toHaveProperty("requestHash");
    expect(settlement).not.toHaveProperty("idempotencyKey");

    const [event] = await events(settlement.id);
    expect(event).toMatchObject({ action: "settlement.created", actorUserId: bob.id, requestId: res.headers["x-request-id"] });
    expect(event.after).toMatchObject({ status: "pending", amountMinor: 20000 });
  });

  it.each(["cash", "upi", "bank", "other"])("accepts the %s method", async (method) => {
    expect((await pay(bob, { ...valid(), method })).status).toBe(201);
  });

  it("changes no balance while pending", async () => {
    await f.addExpense(household, alice, 10000, { [alice.id]: 5000, [bob.id]: 5000 });
    await pay(bob, { ...valid(), amountMinor: 5000 });
    expect(await f.balancesOf(household, [alice, bob])).toEqual({ [alice.id]: 5000, [bob.id]: -5000 });
  });

  it("allows an amount larger than what is owed", async () => {
    expect((await pay(bob, { ...valid(), amountMinor: 999_999 })).status).toBe(201);
  });

  describe("who it may be sent to", () => {
    it("refuses yourself", async () => {
      const res = await pay(bob, { ...valid(), toUserId: bob.id });
      expect(res.status).toBe(400);
      expect(res.body.error.details.map((d) => d.field)).toContain("toUserId");
    });

    it.each([
      ["a stranger", () => carol.id],
      ["someone who does not exist", () => "no-such-user"],
    ])("refuses %s", async (_label, pick) => {
      const res = await pay(bob, { ...valid(), toUserId: pick() });
      expect(res.status).toBe(400);
      expect(res.body.error.details.map((d) => d.field)).toContain("toUserId");
      expect(await testDb.settlement.count()).toBe(0);
    });

    it("refuses a member who has left", async () => {
      await testDb.householdMember.updateMany({ where: { householdId: household.id, userId: alice.id }, data: { status: "left", leftAt: new Date() } });
      expect((await pay(bob, valid())).status).toBe(400);
    });
  });

  describe("validation and access", () => {
    it.each([
      ["a zero amount", () => ({ amountMinor: 0 })],
      ["a fractional amount", () => ({ amountMinor: 1.5 })],
      ["an unknown field", () => ({ status: "confirmed" })],
      ["a sender", () => ({ fromUserId: alice.id })],
    ])("rejects %s with 400 and stores nothing", async (_label, change) => {
      const res = await pay(bob, { ...valid(), ...change() });
      expect(res.status).toBe(400);
      expect(await testDb.settlement.count()).toBe(0);
    });

    it("needs an Idempotency-Key", async () => {
      expect((await pay(bob, valid(), null)).status).toBe(400);
    });

    it("gives a stranger 404 and nobody 401", async () => {
      expect((await pay(carol, valid())).status).toBe(404);
      expect((await request(app).post(url()).set("Idempotency-Key", "key-12345678").send(valid())).status).toBe(401);
    });
  });

  describe("retries", () => {
    const same = "same-key-1234";

    it("returns the stored repayment, marked as a replay", async () => {
      const first = await pay(bob, valid(), same);
      const again = await pay(bob, valid(), same);
      expect(again.status).toBe(201);
      expect(again.headers["idempotent-replayed"]).toBe("true");
      expect(again.body.data.settlement.id).toBe(first.body.data.settlement.id);
      expect(await testDb.settlement.count()).toBe(1);
      expect(await events(first.body.data.settlement.id)).toHaveLength(1);
    });

    it("refuses a reused key with another request (422)", async () => {
      await pay(bob, valid(), same);
      const clash = await pay(bob, { ...valid(), amountMinor: 1 }, same);
      expect(clash.status).toBe(422);
      expect(clash.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
    });

    it("makes one row when two identical requests arrive at once", async () => {
      const results = await Promise.all([pay(bob, valid(), "race-key-1234"), pay(bob, valid(), "race-key-1234")]);
      expect(results.map((r) => r.status)).toEqual([201, 201]);
      expect(new Set(results.map((r) => r.body.data.settlement.id)).size).toBe(1);
      expect(await testDb.settlement.count()).toBe(1);
    });
  });

  describe("reading", () => {
    it("lists newest first, filters by status and pages with a cursor; every member sees every repayment", async () => {
      const a = await f.addRepayment(household, bob, alice, 100, "confirmed");
      const b = await f.addRepayment(household, bob, alice, 200, "pending");
      const c = await f.addRepayment(household, alice, bob, 300, "pending");

      const all = await request(app).get(url()).set(f.bearer(alice));
      expect(all.status).toBe(200);
      expect(all.body.data.settlements).toHaveLength(3);
      expect(all.body.data.settlements.map((s) => s.id).sort()).toEqual([a.id, b.id, c.id].sort());

      const pending = await request(app).get(`${url()}?status=pending`).set(f.bearer(bob));
      expect(pending.body.data.settlements.map((s) => s.id).sort()).toEqual([b.id, c.id].sort());

      const page1 = await request(app).get(`${url()}?limit=2`).set(f.bearer(bob));
      expect(page1.body.data.settlements).toHaveLength(2);
      const { nextCursor } = page1.body.meta.pagination;
      expect(nextCursor).toBeTruthy();
      const page2 = await request(app).get(`${url()}?limit=2&cursor=${encodeURIComponent(nextCursor)}`).set(f.bearer(bob));
      expect(page2.body.data.settlements).toHaveLength(1);
      expect(page2.body.meta.pagination.nextCursor).toBeNull();
      const seen = [...page1.body.data.settlements, ...page2.body.data.settlements].map((s) => s.id);
      expect(new Set(seen).size).toBe(3);
    });

    it("rejects a garbage cursor", async () => {
      expect((await request(app).get(`${url()}?cursor=garbage`).set(f.bearer(bob))).status).toBe(400);
    });

    it("gets one repayment, and 404s for an unknown id, another household, or a stranger", async () => {
      const s = await f.addRepayment(household, bob, alice, 100, "pending");
      const ok = await request(app).get(url(`/${s.id}`)).set(f.bearer(alice));
      expect(ok.status).toBe(200);
      expect(ok.body.data.settlement).toMatchObject({ id: s.id, status: "pending" });
      expect(ok.body.data.settlement).not.toHaveProperty("requestHash");

      expect((await request(app).get(url("/nope")).set(f.bearer(alice))).status).toBe(404);
      expect((await request(app).get(url(`/${s.id}`)).set(f.bearer(carol))).status).toBe(404);

      const other = await f.makeWorld(["Dan", "Eve"]);
      const there = await request(app).get(`/api/v1/households/${other.household.id}/settlements/${s.id}`).set(f.bearer(other.users[0]));
      expect(there.status).toBe(404);
    });

    it("lists nothing for a stranger (404) and nothing without a token (401)", async () => {
      expect((await request(app).get(url()).set(f.bearer(carol))).status).toBe(404);
      expect((await request(app).get(url())).status).toBe(401);
    });
  });
});
