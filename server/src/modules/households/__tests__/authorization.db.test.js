import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";

// The tenancy suite. Real database, real queries. Skipped without TEST_DATABASE_URL.
// It grows as routes arrive; today it covers the read side (membership check, list, get).
describe.skipIf(!process.env.TEST_DATABASE_URL)("household authorization", () => {
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

  const get = (user, path) => request(app).get(`/api/v1${path}`).set(f.bearer(user));
  const shape = (res) => ({ status: res.status, error: res.body.error });

  describe("a stranger", () => {
    it("gets 404 for a household she is not in", async () => {
      const res = await get(carol, `/households/${household.id}`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    });

    it("sees nothing of it in her own list", async () => {
      expect((await get(carol, "/households")).body.data.households).toEqual([]);
    });

    it("cannot tell a real household from one that does not exist", async () => {
      const real = await get(carol, `/households/${household.id}`);
      const fake = await get(carol, "/households/does-not-exist-123");
      expect(shape(real)).toEqual(shape(fake));
    });
  });

  describe("members", () => {
    it("both owner and member can read the household", async () => {
      expect((await get(alice, `/households/${household.id}`)).body.data.household.myRole).toBe("owner");
      expect((await get(bob, `/households/${household.id}`)).body.data.household.myRole).toBe("member");
    });
  });

  describe("someone who left", () => {
    it("loses access straight away", async () => {
      await testDb.householdMember.updateMany({
        where: { householdId: household.id, userId: bob.id },
        data: { status: "left", leftAt: new Date() },
      });
      expect((await get(bob, `/households/${household.id}`)).status).toBe(404);
      expect((await get(bob, "/households")).body.data.households).toEqual([]);
      expect((await get(alice, `/households/${household.id}`)).status).toBe(200);
    });
  });

  describe("an archived household", () => {
    it("is gone for everyone, including its old members", async () => {
      await testDb.household.update({ where: { id: household.id }, data: { archivedAt: new Date() } });
      expect((await get(alice, `/households/${household.id}`)).status).toBe(404);
      expect((await get(alice, "/households")).body.data.households).toEqual([]);
    });
  });

  describe("two households", () => {
    it("never leak into each other", async () => {
      const other = await f.makeHousehold(carol, "Carol's flat");
      const mine = await get(alice, "/households");
      expect(mine.body.data.households.map((h) => h.id)).toEqual([household.id]);
      expect((await get(alice, `/households/${other.id}`)).status).toBe(404);
      expect((await get(carol, `/households/${household.id}`)).status).toBe(404);
    });
  });

  describe("no or bad credentials", () => {
    it("gets 401, not 404", async () => {
      const id = household.id;
      expect((await request(app).get(`/api/v1/households/${id}`)).status).toBe(401);
      expect((await request(app).get("/api/v1/households")).status).toBe(401);
      expect((await request(app).get(`/api/v1/households/${id}`).set("Authorization", "Bearer junk")).status).toBe(401);
    });
  });

  // The write routes: change settings, invite, leave.
  const call = (user, method, path, body) => request(app)[method](`/api/v1${path}`).set(f.bearer(user)).send(body);
  const unchanged = async () => {
    expect((await testDb.household.findUnique({ where: { id: household.id } })).name).toBe("Flat 302");
    expect(await testDb.invitation.count()).toBe(0);
    expect(await testDb.householdMember.count({ where: { householdId: household.id, status: "active" } })).toBe(2);
  };

  describe("write routes for a stranger", () => {
    it("get 404 on change, invite and leave, and nothing changes", async () => {
      const id = household.id;
      const attempts = await Promise.all([
        call(carol, "patch", `/households/${id}`, { name: "Hijacked" }),
        call(carol, "post", `/households/${id}/invitations`, {}),
        call(carol, "post", `/households/${id}/leave`, {}),
      ]);
      for (const res of attempts) {
        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe("NOT_FOUND");
      }
      await unchanged();
    });

    it("cannot tell a real household from a fake one on write routes either", async () => {
      for (const [method, suffix, body] of [["patch", "", { name: "x" }], ["post", "/invitations", {}], ["post", "/leave", {}]]) {
        const real = await call(carol, method, `/households/${household.id}${suffix}`, body);
        const fake = await call(carol, method, `/households/not-a-real-id${suffix}`, body);
        expect(shape(real)).toEqual(shape(fake));
      }
    });

    it("cannot use a household she owns to act on someone else's", async () => {
      const hers = await f.makeHousehold(carol, "Carol's flat");
      expect((await call(carol, "patch", `/households/${household.id}`, { name: "Hijacked" })).status).toBe(404);
      expect((await call(alice, "patch", `/households/${hers.id}`, { name: "Hijacked" })).status).toBe(404);
      await unchanged();
    });
  });

  describe("owner-only routes for a plain member", () => {
    it("get 403 on change and invite, and nothing changes", async () => {
      expect((await call(bob, "patch", `/households/${household.id}`, { name: "Mine now" })).status).toBe(403);
      expect((await call(bob, "post", `/households/${household.id}/invitations`, {})).status).toBe(403);
      await unchanged();
    });
  });

  describe("someone who left", () => {
    it("cannot change, invite or leave again", async () => {
      expect((await call(bob, "post", `/households/${household.id}/leave`, {})).status).toBe(200);
      expect((await call(bob, "patch", `/households/${household.id}`, { name: "x" })).status).toBe(404);
      expect((await call(bob, "post", `/households/${household.id}/invitations`, {})).status).toBe(404);
      expect((await call(bob, "post", `/households/${household.id}/leave`, {})).status).toBe(404);
    });
  });

  describe("invitation links", () => {
    it("only ever add the accepter to the household that issued them", async () => {
      const dave = await f.makeUser("Dave"); // bob is already a member in this suite
      const other = await f.makeHousehold(carol, "Carol's flat");
      const { token } = (await call(alice, "post", `/households/${household.id}/invitations`, {})).body.data;
      expect((await call(dave, "post", "/invitations/accept", { token })).status).toBe(200);
      expect((await call(dave, "get", `/households/${household.id}`)).status).toBe(200);
      expect(await testDb.householdMember.count({ where: { userId: dave.id, householdId: other.id } })).toBe(0);
      expect((await call(dave, "get", `/households/${other.id}`)).status).toBe(404);
    });
  });
});
