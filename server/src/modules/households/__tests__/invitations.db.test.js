import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";

// Real database. Skipped without TEST_DATABASE_URL.
describe.skipIf(!process.env.TEST_DATABASE_URL)("invitations: create and accept", () => {
  let app, resetDb, testDb, f, hashToken;
  let alice, bob, carol, household; // alice owns the household; bob and carol start outside it

  beforeAll(async () => {
    ({ default: app } = await import("../../../app.js"));
    ({ resetDb, testDb } = await import("../../../test/db-helper.js"));
    ({ hashToken } = await import("../../../lib/tokens.js"));
    f = await import("../../../test/factories.js");
  });

  beforeEach(async () => {
    await resetDb();
    alice = await f.makeUser("Alice");
    bob = await f.makeUser("Bob", "bob@example.com");
    carol = await f.makeUser("Carol", "carol@example.com");
    household = await f.makeHousehold(alice);
  });

  const invite = (user, body, householdId = household.id) =>
    request(app).post(`/api/v1/households/${householdId}/invitations`).set(f.bearer(user)).send(body);
  const accept = (user, token) => request(app).post("/api/v1/invitations/accept").set(f.bearer(user)).send({ token });
  const newToken = async (body = {}) => (await invite(alice, body)).body.data.token;
  const memberCount = () => testDb.householdMember.count({ where: { householdId: household.id, status: "active" } });

  describe("POST /api/v1/households/:householdId/invitations", () => {
    it("lets the owner create one, returns the token once, and stores only its hash", async () => {
      const res = await invite(alice, {});
      expect(res.status).toBe(201);
      const { invitation, token } = res.body.data;
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(invitation.invitedEmail).toBeNull();

      const days = (new Date(invitation.expiresAt) - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(6.9);
      expect(days).toBeLessThanOrEqual(7);

      const row = await testDb.invitation.findUnique({ where: { id: invitation.id } });
      expect(row.tokenHash).toBe(hashToken(token));
      expect(row.tokenHash).not.toBe(token);
      expect(await testDb.invitation.count({ where: { tokenHash: token } })).toBe(0);
      expect(JSON.stringify(row)).not.toContain(token);
    });

    it("works with no body at all", async () => {
      const res = await request(app).post(`/api/v1/households/${household.id}/invitations`).set(f.bearer(alice));
      expect(res.status).toBe(201);
    });

    it("cleans the email lock", async () => {
      const res = await invite(alice, { email: "  Bob@Example.COM " });
      expect(res.body.data.invitation.invitedEmail).toBe("bob@example.com");
    });

    it.each([
      ["a bad email", { email: "nope" }, "email"],
      ["an unknown field", { email: "bob@example.com", role: "owner" }, "role"],
    ])("rejects %s with a 400", async (_label, body, field) => {
      const res = await invite(alice, body);
      expect(res.status).toBe(400);
      expect(res.body.error.details.map((d) => d.field)).toContain(field);
      expect(await testDb.invitation.count()).toBe(0);
    });

    it("is for the owner only: a member gets 403, a stranger 404, nobody 401", async () => {
      await f.addMember(household, bob);
      expect((await invite(bob, {})).status).toBe(403);
      expect((await invite(carol, {})).status).toBe(404);
      expect((await request(app).post(`/api/v1/households/${household.id}/invitations`).send({})).status).toBe(401);
      expect(await testDb.invitation.count()).toBe(0);
    });

    it("allows at most 10 open invitations, and used or expired ones do not count", async () => {
      const ids = [];
      for (let i = 0; i < 10; i++) ids.push((await invite(alice, {})).body.data.invitation.id);
      const blocked = await invite(alice, {});
      expect(blocked.status).toBe(409);
      expect(blocked.body.error.code).toBe("INVITE_LIMIT_REACHED");

      await testDb.invitation.update({ where: { id: ids[0] }, data: { expiresAt: new Date(Date.now() - 1000) } });
      expect((await invite(alice, {})).status).toBe(201);
    });
  });

  describe("POST /api/v1/invitations/accept", () => {
    it("adds the accepter as a member, uses the invitation, and lets them read the household", async () => {
      const token = await newToken();
      const res = await accept(bob, token);
      expect(res.status).toBe(200);
      expect(res.body.data.household).toMatchObject({ name: "Flat 302", myRole: "member" });
      expect(res.body.data.household.members.map((m) => m.name)).toEqual(["Alice", "Bob"]);

      expect(await memberCount()).toBe(2);
      expect((await testDb.invitation.findUnique({ where: { tokenHash: hashToken(token) } })).usedAt).toBeInstanceOf(Date);
      expect((await request(app).get(`/api/v1/households/${household.id}`).set(f.bearer(bob))).status).toBe(200);
    });

    it("works only once", async () => {
      const token = await newToken();
      expect((await accept(bob, token)).status).toBe(200);
      const second = await accept(carol, token);
      expect(second.status).toBe(400);
      expect(second.body.error.code).toBe("INVALID_INVITATION");
      expect(await memberCount()).toBe(2);
    });

    it("gives the same answer for used, expired, unknown and wrong-email invitations", async () => {
      const used = await newToken();
      await accept(bob, used);
      const expired = await newToken();
      await testDb.invitation.updateMany({ where: { tokenHash: hashToken(expired) }, data: { expiresAt: new Date(Date.now() - 1000) } });
      const locked = await newToken({ email: "bob@example.com" });

      const answers = [
        await accept(carol, used),
        await accept(carol, expired),
        await accept(carol, "z".repeat(43)),
        await accept(carol, locked), // carol's email does not match the lock
      ];
      for (const res of answers) {
        expect(res.status).toBe(400);
        expect(res.body.error).toEqual({ code: "INVALID_INVITATION", message: "This invitation is invalid or has expired" });
      }
      expect(await memberCount()).toBe(2); // only bob joined
    });

    it("lets the right email accept a locked invitation", async () => {
      const token = await newToken({ email: "bob@example.com" });
      expect((await accept(bob, token)).status).toBe(200);
    });

    it("refuses someone who is already a member and keeps the invitation unused", async () => {
      await f.addMember(household, bob);
      const token = await newToken();
      const res = await accept(bob, token);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("ALREADY_MEMBER");
      expect((await testDb.invitation.findUnique({ where: { tokenHash: hashToken(token) } })).usedAt).toBeNull();
    });

    it("lets exactly one of two simultaneous accepts win", async () => {
      const token = await newToken();
      const results = await Promise.all([accept(bob, token), accept(carol, token)]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
      expect(await memberCount()).toBe(2); // alice plus exactly one newcomer
    });

    it("lets someone who left come back through a new invitation, reusing their row", async () => {
      await f.addMember(household, bob);
      await testDb.householdMember.updateMany({ where: { householdId: household.id, userId: bob.id }, data: { status: "left", leftAt: new Date() } });
      expect((await request(app).get(`/api/v1/households/${household.id}`).set(f.bearer(bob))).status).toBe(404);

      expect((await accept(bob, await newToken())).status).toBe(200);
      const rows = await testDb.householdMember.findMany({ where: { householdId: household.id, userId: bob.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ status: "active", leftAt: null, role: "member" });
    });

    it("refuses an invitation to an archived household", async () => {
      const token = await newToken();
      await testDb.household.update({ where: { id: household.id }, data: { archivedAt: new Date() } });
      expect((await accept(bob, token)).status).toBe(400);
    });

    it.each([
      ["no token", {}],
      ["a too-short token", { token: "short" }],
      ["a token with bad characters", { token: "!".repeat(43) }],
      ["an unknown field", { token: "a".repeat(43), extra: 1 }],
    ])("rejects %s with a 400", async (_label, body) => {
      const res = await request(app).post("/api/v1/invitations/accept").set(f.bearer(bob)).send(body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
    });

    it("requires a login", async () => {
      const res = await request(app).post("/api/v1/invitations/accept").send({ token: "a".repeat(43) });
      expect(res.status).toBe(401);
    });
  });
});
