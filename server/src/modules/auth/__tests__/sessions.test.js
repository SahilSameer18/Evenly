import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../auth.repository.js", async () => {
  const store = await import("../../../test/fakeTokenStore.js");
  return {
    findUserByEmail: vi.fn(),
    createRefreshToken: store.createRefreshToken,
    findRefreshToken: store.findRefreshToken,
    rotateRefreshToken: store.rotateRefreshToken,
    revokeFamily: store.revokeFamily,
    findUserWithHashById: vi.fn(),
    updatePasswordAndRevokeSessions: vi.fn(),
  };
});
vi.mock("../../users/users.repository.js", () => ({ findUserById: vi.fn() }));

const { default: app } = await import("../../../app.js");
const repository = await import("../auth.repository.js");
const users = await import("../../users/users.repository.js");
const store = await import("../../../test/fakeTokenStore.js");
const { hashPassword, verifyPassword } = await import("../../../lib/password.js");
const { hashToken } = await import("../../../lib/tokens.js");

const PASSWORD = "correct-horse-1";
const user = { id: "user-1", email: "asha@example.com", name: "Asha", createdAt: new Date("2026-11-02T00:00:00Z") };

let originalHash;

beforeAll(async () => {
  originalHash = user.passwordHash = await hashPassword(PASSWORD);
});

beforeEach(() => {
  store.reset();
  user.passwordHash = originalHash;
  repository.findUserByEmail.mockResolvedValue(user);
  repository.findUserWithHashById.mockResolvedValue(user);
  repository.updatePasswordAndRevokeSessions.mockImplementation(async (userId, passwordHash) => {
    user.passwordHash = passwordHash;
    store.revokeUser(userId);
  });
  users.findUserById.mockResolvedValue(user);
});

const cookieOf = (res) => res.headers["set-cookie"]?.find((c) => c.startsWith("refresh_token="));
const valueOf = (cookie) => cookie.split(";")[0].split("=")[1];
const loginWith = (password) => request(app).post("/api/v1/auth/login").send({ email: user.email, password });
const login = () => loginWith(PASSWORD);
const cookieHeader = (token) => (token ? `refresh_token=${token}` : "");
// The cookie endpoints require the custom header; the CSRF tests below send requests without it.
const refresh = (token) => request(app).post("/api/v1/auth/refresh").set("X-Evenly-Client", "web").set("Cookie", cookieHeader(token));
const logout = (token) => request(app).post("/api/v1/auth/logout").set("X-Evenly-Client", "web").set("Cookie", cookieHeader(token));
const changePassword = (accessToken, body) =>
  request(app).post("/api/v1/auth/change-password").set("Authorization", `Bearer ${accessToken}`).send(body);

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
      .set("X-Evenly-Client", "web")
      .set("Authorization", `Bearer ${token}`)
      .send({ refresh_token: token, refreshToken: token });
    expect(res.status).toBe(401);
  });

  it("lets only one of two simultaneous requests with the same token win", async () => {
    const token = valueOf(cookieOf(await login()));
    const results = await Promise.all([refresh(token), refresh(token)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
    // Losing the race must not be mistaken for theft: the winner's new token still works.
    const winner = results.find((r) => r.status === 200);
    expect((await refresh(valueOf(cookieOf(winner)))).status).toBe(200);
  });
});

describe("reuse detection", () => {
  it("revokes the whole family when a spent token comes back after the grace window", async () => {
    const first = valueOf(cookieOf(await login()));
    const second = valueOf(cookieOf(await refresh(first)));
    store.rows.get(hashToken(first)).usedAt = new Date(Date.now() - 60_000);

    expect((await refresh(first)).status).toBe(401);
    expect((await refresh(second)).status).toBe(401); // the newest token dies too, so the thief and the real user must log in again
    expect([...store.rows.values()].every((r) => r.revokedAt)).toBe(true);
  });

  it("treats a replay inside the grace window as a race: rejected, but the session survives", async () => {
    const first = valueOf(cookieOf(await login()));
    const second = valueOf(cookieOf(await refresh(first)));
    expect((await refresh(first)).status).toBe(401);
    expect((await refresh(second)).status).toBe(200);
  });

  it("leaves the user's other logins alone", async () => {
    const phone = valueOf(cookieOf(await login()));
    const laptop = valueOf(cookieOf(await login()));
    await refresh(phone);
    store.rows.get(hashToken(phone)).usedAt = new Date(Date.now() - 60_000);
    await refresh(phone); // replay
    expect((await refresh(laptop)).status).toBe(200);
  });
});

describe("POST /api/v1/auth/logout", () => {
  it("revokes the session, clears the cookie, and blocks later refreshes", async () => {
    const token = valueOf(cookieOf(await login()));
    const res = await logout(token);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ loggedOut: true });
    expect(cookieOf(res)).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect((await refresh(token)).status).toBe(401);
  });

  it("also kills the newest token of the session", async () => {
    const newest = valueOf(cookieOf(await refresh(valueOf(cookieOf(await login())))));
    await logout(newest);
    expect((await refresh(newest)).status).toBe(401);
  });

  it("ends only this device's session", async () => {
    const phone = valueOf(cookieOf(await login()));
    const laptop = valueOf(cookieOf(await login()));
    await logout(phone);
    expect((await refresh(laptop)).status).toBe(200);
  });

  it("is harmless with no cookie or an unknown one", async () => {
    expect((await logout(null)).status).toBe(200);
    expect((await logout("not-a-real-token")).status).toBe(200);
  });
});

describe("CSRF guard on the cookie endpoints", () => {
  it("blocks requests without the custom header, with a wrong value, or from a foreign origin", async () => {
    const token = valueOf(cookieOf(await login()));
    const raw = (path) => request(app).post(path).set("Cookie", cookieHeader(token));

    for (const path of ["/api/v1/auth/refresh", "/api/v1/auth/logout"]) {
      const missing = await raw(path);
      expect(missing.status).toBe(403);
      expect(missing.body.error.code).toBe("CSRF_BLOCKED");
      expect((await raw(path).set("X-Evenly-Client", "mobile")).status).toBe(403);
      expect((await raw(path).set("X-Evenly-Client", "web").set("Origin", "https://evil.example")).status).toBe(403);
    }
    expect((await refresh(token)).status).toBe(200); // none of the blocked attempts used up or revoked the session
  });

  it("accepts the configured client origin", async () => {
    const token = valueOf(cookieOf(await login()));
    const res = await refresh(token).set("Origin", process.env.CLIENT_ORIGIN ?? "http://localhost:5173");
    expect(res.status).toBe(200);
  });
});

describe("POST /api/v1/auth/change-password", () => {
  const NEW_PASSWORD = "brand-new-pass-9";
  const accessTokenOf = async () => (await login()).body.data.accessToken;

  it("requires a logged-in user", async () => {
    const res = await request(app).post("/api/v1/auth/change-password").send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    expect(res.status).toBe(401);
  });

  it("rejects a wrong current password with 403 and changes nothing", async () => {
    const token = valueOf(cookieOf(await login()));
    const res = await changePassword(await accessTokenOf(), { currentPassword: "not-my-password", newPassword: NEW_PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("INVALID_CURRENT_PASSWORD");
    expect(user.passwordHash).toBe(originalHash);
    expect((await refresh(token)).status).toBe(200);
  });

  it.each([
    ["a too-short new password", { currentPassword: PASSWORD, newPassword: "short" }],
    ["the same password again", { currentPassword: PASSWORD, newPassword: PASSWORD }],
    ["an unknown field", { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, extra: 1 }],
  ])("rejects %s with a 400", async (_label, body) => {
    const res = await changePassword(await accessTokenOf(), body);
    expect(res.status).toBe(400);
    expect(repository.updatePasswordAndRevokeSessions).not.toHaveBeenCalled();
  });

  it("stores a new hash, signs out every other device, and starts a fresh session here", async () => {
    const phone = valueOf(cookieOf(await login()));
    const laptop = valueOf(cookieOf(await login()));
    const res = await changePassword(await accessTokenOf(), { currentPassword: PASSWORD, newPassword: NEW_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect((await refresh(phone)).status).toBe(401);
    expect((await refresh(laptop)).status).toBe(401);
    expect((await refresh(valueOf(cookieOf(res)))).status).toBe(200);
    expect(await verifyPassword(user.passwordHash, NEW_PASSWORD)).toBe(true);
    expect(await verifyPassword(user.passwordHash, PASSWORD)).toBe(false);
  });

  it("makes the old password stop working at login", async () => {
    await changePassword(await accessTokenOf(), { currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    expect((await loginWith(PASSWORD)).status).toBe(401);
    expect((await loginWith(NEW_PASSWORD)).status).toBe(200);
  });
});
