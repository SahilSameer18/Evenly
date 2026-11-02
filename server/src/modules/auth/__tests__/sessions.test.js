import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../auth.repository.js", async () => {
  const store = await import("../../../test/fakeTokenStore.js");
  return {
    findUserByEmail: vi.fn(),
    createRefreshToken: store.createRefreshToken,
    findRefreshToken: store.findRefreshToken,
    rotateRefreshToken: store.rotateRefreshToken,
  };
});
vi.mock("../../users/users.repository.js", () => ({ findUserById: vi.fn() }));

const { default: app } = await import("../../../app.js");
const repository = await import("../auth.repository.js");
const users = await import("../../users/users.repository.js");
const store = await import("../../../test/fakeTokenStore.js");
const { hashPassword } = await import("../../../lib/password.js");
const { hashToken } = await import("../../../lib/tokens.js");

const PASSWORD = "correct-horse-1";
const user = { id: "user-1", email: "asha@example.com", name: "Asha", createdAt: new Date("2026-11-02T00:00:00Z") };

beforeAll(async () => {
  user.passwordHash = await hashPassword(PASSWORD);
});

beforeEach(() => {
  store.reset();
  repository.findUserByEmail.mockResolvedValue(user);
  users.findUserById.mockResolvedValue(user);
});

const cookieOf = (res) => res.headers["set-cookie"]?.find((c) => c.startsWith("refresh_token="));
const valueOf = (cookie) => cookie.split(";")[0].split("=")[1];
const login = () => request(app).post("/api/v1/auth/login").send({ email: user.email, password: PASSWORD });
const refresh = (token) => request(app).post("/api/v1/auth/refresh").set("Cookie", token ? `refresh_token=${token}` : "");

describe("login issues a session", () => {
  it("returns an access token in the body and the refresh token only in a locked-down cookie", async () => {
    const res = await login();
    const cookie = cookieOf(res);
    expect(res.body.data.accessToken.split(".")).toHaveLength(3); // a JWT
    expect(res.body.data.expiresIn).toBe(900);
    expect(JSON.stringify(res.body)).not.toContain(valueOf(cookie));
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Max-Age=2592000/);
  });

  it("stores only a hash of the refresh token", async () => {
    const token = valueOf(cookieOf(await login()));
    expect(store.rows.has(token)).toBe(false);
    expect(store.rows.has(hashToken(token))).toBe(true);
    expect([...store.rows.values()][0]).toMatchObject({ userId: "user-1", usedAt: null, revokedAt: null });
  });

  it("gives every login its own token family", async () => {
    await login();
    await login();
    const families = new Set([...store.rows.values()].map((r) => r.familyId));
    expect(families.size).toBe(2);
  });

  it("returns an access token that works on /users/me", async () => {
    const { accessToken } = (await login()).body.data;
    const me = await request(app).get("/api/v1/users/me").set("Authorization", `Bearer ${accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe("asha@example.com");
  });
});

describe("POST /api/v1/auth/refresh", () => {
  it("swaps the refresh token for a new one and returns a new access token", async () => {
    const first = valueOf(cookieOf(await login()));
    const res = await refresh(first);
    const second = valueOf(cookieOf(res));
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(second).not.toBe(first);
    expect(store.rows.get(hashToken(first)).usedAt).toBeInstanceOf(Date);
    expect(store.rows.get(hashToken(second)).familyId).toBe(store.rows.get(hashToken(first)).familyId);
  });

  it("keeps working down a chain of refreshes", async () => {
    let token = valueOf(cookieOf(await login()));
    for (let i = 0; i < 3; i++) {
      const res = await refresh(token);
      expect(res.status).toBe(200);
      token = valueOf(cookieOf(res));
    }
  });

  it("rejects a token that was already used, and clears the cookie", async () => {
    const first = valueOf(cookieOf(await login()));
    await refresh(first);
    const replay = await refresh(first);
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe("INVALID_SESSION");
    expect(cookieOf(replay)).toMatch(/Expires=Thu, 01 Jan 1970/);
  });

  it("rejects a missing, garbage or expired token", async () => {
    expect((await refresh(null)).status).toBe(401);
    expect((await refresh("not-a-real-token")).status).toBe(401);

    const token = valueOf(cookieOf(await login()));
    store.rows.get(hashToken(token)).expiresAt = new Date(Date.now() - 1000);
    expect((await refresh(token)).status).toBe(401);
  });

  it("only reads the token from the cookie, never from the body or a header", async () => {
    const token = valueOf(cookieOf(await login()));
    const res = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Authorization", `Bearer ${token}`)
      .send({ refresh_token: token, refreshToken: token });
    expect(res.status).toBe(401);
  });

  it("lets only one of two simultaneous requests with the same token win", async () => {
    const token = valueOf(cookieOf(await login()));
    const results = await Promise.all([refresh(token), refresh(token)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
  });
});
