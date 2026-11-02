import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";

// Real database, real unique index. Skipped until TEST_DATABASE_URL points at a separate Neon branch.
describe.skipIf(!process.env.TEST_DATABASE_URL)("register against the test database", () => {
  let app, testDb, resetDb;

  beforeAll(async () => {
    ({ default: app } = await import("../../../app.js"));
    ({ testDb, resetDb } = await import("../../../test/db-helper.js"));
  });
  beforeEach(() => resetDb());

  const body = { email: "asha@example.com", password: "correct-horse-1", name: "Asha" };
  const register = (b) => request(app).post("/api/v1/auth/register").send(b);

  it("stores one user with an Argon2id hash", async () => {
    expect((await register(body)).status).toBe(201);
    const rows = await testDb.user.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].passwordHash.startsWith("$argon2id$")).toBe(true);
  });

  it("rejects the same email twice, whatever its letter case", async () => {
    await register(body);
    const again = await register({ ...body, email: "ASHA@Example.com" });
    expect(again.status).toBe(409);
    expect(await testDb.user.count()).toBe(1);
  });

  it("lets two simultaneous sign-ups with one email produce exactly one user", async () => {
    const results = await Promise.all([register(body), register(body)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await testDb.user.count()).toBe(1);
  });
});
