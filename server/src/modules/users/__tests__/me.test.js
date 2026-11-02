import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { SignJWT } from "jose";

vi.mock("../users.repository.js", () => ({ findUserById: vi.fn() }));

const { default: app } = await import("../../../app.js");
const users = await import("../users.repository.js");
const { signAccessToken } = await import("../../../lib/tokens.js");

const user = { id: "user-1", email: "asha@example.com", name: "Asha", createdAt: new Date("2026-11-02T00:00:00Z") };
const secret = (s = process.env.JWT_ACCESS_SECRET) => new TextEncoder().encode(s);

// Builds a token by hand so each test can break exactly one thing.
function forge({ sub = "user-1", iss = "evenly", aud = "evenly-api", exp = "10m", key = secret() } = {}) {
  return new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(sub).setIssuer(iss).setAudience(aud).setIssuedAt().setExpirationTime(exp).sign(key);
}

const me = (token) => {
  const r = request(app).get("/api/v1/users/me");
  return token ? r.set("Authorization", `Bearer ${token}`) : r;
};

beforeEach(() => {
  users.findUserById.mockReset();
  users.findUserById.mockResolvedValue(user);
});

describe("GET /api/v1/users/me", () => {
  it("returns the current user for a valid token", async () => {
    const res = await me(await signAccessToken("user-1"));
    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ id: "user-1", email: "asha@example.com" });
    expect(users.findUserById).toHaveBeenCalledWith("user-1");
  });

  it("rejects a request with no token, a wrong scheme, or junk", async () => {
    expect((await me()).status).toBe(401);
    expect((await request(app).get("/api/v1/users/me").set("Authorization", "Basic abc")).status).toBe(401);
    expect((await me("not.a.jwt")).status).toBe(401);
    expect((await request(app).get("/api/v1/users/me").set("Authorization", "Bearer")).status).toBe(401);
  });

  it("reports an expired token as TOKEN_EXPIRED so the client knows to refresh", async () => {
    const res = await me(await forge({ exp: Math.floor(Date.now() / 1000) - 60 }));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("TOKEN_EXPIRED");
  });

  it("rejects a token signed with a different secret", async () => {
    const res = await me(await forge({ key: secret("a-completely-different-secret-value-123456") }));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("rejects a token with the wrong issuer or audience", async () => {
    expect((await me(await forge({ iss: "someone-else" }))).status).toBe(401);
    expect((await me(await forge({ aud: "another-api" }))).status).toBe(401);
  });

  it("rejects a token whose payload was edited after signing", async () => {
    const [head, , sig] = (await signAccessToken("user-1")).split(".");
    const evil = Buffer.from(JSON.stringify({ sub: "user-2", iss: "evenly", aud: "evenly-api", exp: 9999999999 })).toString("base64url");
    expect((await me(`${head}.${evil}.${sig}`)).status).toBe(401);
  });

  it("rejects an unsigned token (alg: none)", async () => {
    const part = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const none = `${part({ alg: "none", typ: "JWT" })}.${part({ sub: "user-1", iss: "evenly", aud: "evenly-api", exp: 9999999999 })}.`;
    expect((await me(none)).status).toBe(401);
  });

  it("rejects a valid token whose account no longer exists", async () => {
    users.findUserById.mockResolvedValue(null);
    expect((await me(await signAccessToken("user-1"))).status).toBe(401);
  });
});
