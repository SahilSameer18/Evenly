import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";

// Real database: proves the conditional UPDATE in rotateRefreshToken really lets one request win.
// Skipped until TEST_DATABASE_URL points at a separate Neon branch.
describe.skipIf(!process.env.TEST_DATABASE_URL)("sessions against the test database", () => {
  let app, testDb, resetDb;
  const creds = { email: "asha@example.com", password: "correct-horse-1" };
  const valueOf = (res) => res.headers["set-cookie"].find((c) => c.startsWith("refresh_token=")).split(";")[0].split("=")[1];
  const refresh = (token) => request(app).post("/api/v1/auth/refresh").set("X-Evenly-Client", "web").set("Cookie", `refresh_token=${token}`);

  beforeAll(async () => {
    ({ default: app } = await import("../../../app.js"));
    ({ testDb, resetDb } = await import("../../../test/db-helper.js"));
  });

  beforeEach(async () => {
    await resetDb();
    await request(app).post("/api/v1/auth/register").send({ ...creds, name: "Asha" });
  });

  it("logs in, rotates, and refuses a replay", async () => {
    const login = await request(app).post("/api/v1/auth/login").send(creds);
    expect(login.status).toBe(200);
    const first = valueOf(login);

    const rotated = await refresh(first);
    expect(rotated.status).toBe(200);
    expect(await testDb.refreshToken.count()).toBe(2);

    expect((await refresh(first)).status).toBe(401);
    expect((await refresh(valueOf(rotated))).status).toBe(200);
  });

  it("lets exactly one of two simultaneous refreshes win", async () => {
    const token = valueOf(await request(app).post("/api/v1/auth/login").send(creds));
    const results = await Promise.all([refresh(token), refresh(token)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
    expect(await testDb.refreshToken.count()).toBe(2); // the original plus exactly one replacement
  });

  it("never stores the raw token", async () => {
    const token = valueOf(await request(app).post("/api/v1/auth/login").send(creds));
    expect(await testDb.refreshToken.findFirst({ where: { tokenHash: token } })).toBeNull();
  });
});
