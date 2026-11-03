import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";

// The Part 1 gate, end to end over HTTP with real registration and login (nothing seeded by hand):
// two real users share one household, and a third real user sees nothing of it.
describe.skipIf(!process.env.TEST_DATABASE_URL)("Part 1 gate: two users share a household, a third gets 404", () => {
  let app, resetDb;

  beforeAll(async () => {
    ({ default: app } = await import("../app.js"));
    ({ resetDb } = await import("../test/db-helper.js"));
  });
  beforeEach(() => resetDb());

  const PASSWORD = "correct-horse-1";

  async function signUp(name) {
    const email = `${name.toLowerCase()}@example.com`;
    expect((await request(app).post("/api/v1/auth/register").send({ email, password: PASSWORD, name })).status).toBe(201);
    const login = await request(app).post("/api/v1/auth/login").send({ email, password: PASSWORD });
    expect(login.status).toBe(200);
    return { Authorization: `Bearer ${login.body.data.accessToken}` };
  }

  it("works from sign-up to a shared household", async () => {
    const alice = await signUp("Alice");
    const bob = await signUp("Bob");
    const carol = await signUp("Carol");
    const as = (auth, method, path, body) => request(app)[method](`/api/v1${path}`).set(auth).send(body);

    // Alice creates the household and invites Bob; Bob accepts.
    const created = await as(alice, "post", "/households", { name: "Flat 302" });
    expect(created.status).toBe(201);
    const id = created.body.data.household.id;
    const invite = await as(alice, "post", `/households/${id}/invitations`, { email: "bob@example.com" });
    expect(invite.status).toBe(201);
    const token = invite.body.data.token;
    expect((await as(bob, "post", "/invitations/accept", { token })).status).toBe(200);

    // Both see the same household, with both members.
    for (const [auth, role] of [[alice, "owner"], [bob, "member"]]) {
      const res = await as(auth, "get", `/households/${id}`);
      expect(res.status).toBe(200);
      expect(res.body.data.household.myRole).toBe(role);
      expect(res.body.data.household.members.map((m) => m.name)).toEqual(["Alice", "Bob"]);
    }

    // Only the owner can change settings.
    expect((await as(bob, "patch", `/households/${id}`, { name: "Bob's" })).status).toBe(403);
    expect((await as(alice, "patch", `/households/${id}`, { name: "Flat 303" })).status).toBe(200);

    // The third user gets 404 on everything, sees nothing in her list, and cannot reuse the link.
    for (const [method, path, body] of [
      ["get", `/households/${id}`],
      ["patch", `/households/${id}`, { name: "Hijacked" }],
      ["post", `/households/${id}/invitations`, {}],
      ["post", `/households/${id}/leave`, {}],
    ]) {
      expect((await as(carol, method, path, body)).status).toBe(404);
    }
    expect((await as(carol, "get", "/households")).body.data.households).toEqual([]);
    expect((await as(carol, "post", "/invitations/accept", { token })).status).toBe(400);

    // Nothing Carol tried changed anything.
    expect((await as(alice, "get", `/households/${id}`)).body.data.household).toMatchObject({ name: "Flat 303" });
    expect((await as(alice, "get", `/households/${id}`)).body.data.household.members).toHaveLength(2);
  }, 60_000); // six real Argon2 hashes plus remote database calls
});
