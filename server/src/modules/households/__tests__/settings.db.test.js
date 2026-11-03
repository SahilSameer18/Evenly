import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";

// Real database. Skipped without TEST_DATABASE_URL.
describe.skipIf(!process.env.TEST_DATABASE_URL)("PATCH /api/v1/households/:householdId", () => {
  let app, resetDb, testDb, f;
  let alice, bob, carol, household; // alice owns it, bob is a member, carol is a stranger

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

  const patch = (user, body) => request(app).patch(`/api/v1/households/${household.id}`).set(f.bearer(user)).send(body);
  const stored = () => testDb.household.findUnique({ where: { id: household.id } });

  it("lets the owner change the name, timezone and default split method", async () => {
    const res = await patch(alice, { name: "  Flat 303 ", timezone: "Europe/London", defaultSplitMethod: "weights" });
    expect(res.status).toBe(200);
    expect(res.body.data.household).toMatchObject({ name: "Flat 303", timezone: "Europe/London", defaultSplitMethod: "weights", myRole: "owner", currency: "INR" });
    expect(await stored()).toMatchObject({ name: "Flat 303", timezone: "Europe/London", defaultSplitMethod: "weights" });
  });

  it("changes only the fields it is given", async () => {
    await patch(alice, { name: "Renamed" });
    expect(await stored()).toMatchObject({ name: "Renamed", timezone: "Asia/Kolkata", defaultSplitMethod: "equal" });
  });

  it.each([
    ["an empty body", {}],
    ["a currency (INR only for now)", { currency: "USD" }],
    ["an unknown field", { archivedAt: null }],
    ["a blank name", { name: "   " }],
    ["a bad timezone", { timezone: "Mars/Olympus" }],
    ["a bad split method", { defaultSplitMethod: "random" }],
    ["a valid field plus a bad one", { name: "Sneaky", currency: "USD" }],
  ])("rejects %s with a 400 and changes nothing", async (_label, body) => {
    const res = await patch(alice, body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(await stored()).toMatchObject({ name: "Flat 302", currency: "INR", timezone: "Asia/Kolkata" });
  });

  it("rejects a request with no body at all", async () => {
    const res = await request(app).patch(`/api/v1/households/${household.id}`).set(f.bearer(alice));
    expect(res.status).toBe(400);
  });

  it("is for the owner only: a member gets 403, a stranger 404, nobody 401", async () => {
    expect((await patch(bob, { name: "Mine now" })).status).toBe(403);
    expect((await patch(carol, { name: "Hijacked" })).status).toBe(404);
    expect((await request(app).patch(`/api/v1/households/${household.id}`).send({ name: "x" })).status).toBe(401);
    expect((await stored()).name).toBe("Flat 302");
  });
});
