import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../auth.repository.js", () => ({ findUserByEmail: vi.fn(), createRefreshToken: vi.fn() }));
vi.mock("../../../lib/password.js", async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, verifyPassword: vi.fn(real.verifyPassword) };
});

const { default: app } = await import("../../../app.js");
const repository = await import("../auth.repository.js");
const { hashPassword, verifyPassword } = await import("../../../lib/password.js");

const PASSWORD = "correct-horse-1";
let stored;

beforeAll(async () => {
  stored = {
    id: "user-1",
    email: "asha@example.com",
    name: "Asha",
    createdAt: new Date("2026-11-02T00:00:00Z"),
    passwordHash: await hashPassword(PASSWORD),
  };
});

beforeEach(() => {
  repository.findUserByEmail.mockReset();
  repository.findUserByEmail.mockResolvedValue(stored);
  verifyPassword.mockClear();
});

const login = (body) => request(app).post("/api/v1/auth/login").send(body);

describe("POST /api/v1/auth/login", () => {
  it("accepts the right password, looks the email up lowercased, and returns no hash", async () => {
    const res = await login({ email: " Asha@Example.com", password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.user).toEqual({ id: "user-1", email: "asha@example.com", name: "Asha", createdAt: "2026-11-02T00:00:00.000Z" });
    expect(JSON.stringify(res.body)).not.toMatch(/argon2|passwordHash/i);
    expect(repository.findUserByEmail).toHaveBeenCalledWith("asha@example.com");
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.headers["set-cookie"][0]).toMatch(/^refresh_token=/);
  });

  it("does not start a session when the login fails", async () => {
    const res = await login({ email: "asha@example.com", password: "wrong-password" });
    expect(res.headers["set-cookie"]).toBeUndefined();
    expect(repository.createRefreshToken).not.toHaveBeenCalled();
  });

  it("rejects a wrong password with the generic error", async () => {
    const res = await login({ email: "asha@example.com", password: "wrong-password" });
    expect(res.status).toBe(401);
    expect(res.body.error).toEqual({ code: "INVALID_CREDENTIALS", message: "Invalid email or password" });
  });

  it("answers an unknown email exactly like a wrong password, and still does a password check", async () => {
    const wrong = await login({ email: "asha@example.com", password: "wrong-password" });
    verifyPassword.mockClear();
    repository.findUserByEmail.mockResolvedValue(null);

    const unknown = await login({ email: "nobody@example.com", password: PASSWORD });
    expect(unknown.status).toBe(wrong.status);
    expect(unknown.body.error).toEqual(wrong.body.error);
    expect(verifyPassword).toHaveBeenCalledTimes(1); // same work as a real account, so timing does not give it away
  });

  it("cannot log in to an account whose stored value is not a real hash (seed users)", async () => {
    repository.findUserByEmail.mockResolvedValue({ ...stored, passwordHash: "!seed-account-no-login" });
    const res = await login({ email: "asha@example.com", password: "!seed-account-no-login" });
    expect(res.status).toBe(401);
  });

  it.each([
    ["a bad email", { email: "nope", password: PASSWORD }, "email"],
    ["a missing password", { email: "asha@example.com" }, "password"],
    ["an empty password", { email: "asha@example.com", password: "" }, "password"],
    ["an overlong password", { email: "asha@example.com", password: "x".repeat(129) }, "password"],
    ["an unknown field", { email: "asha@example.com", password: PASSWORD, remember: true }, "remember"],
  ])("rejects %s with a 400 and never queries the database", async (_label, body, field) => {
    const res = await login(body);
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d) => d.field)).toContain(field);
    expect(repository.findUserByEmail).not.toHaveBeenCalled();
  });

  it("returns a clean 500 when the database fails", async () => {
    repository.findUserByEmail.mockRejectedValue(new Error("db password in message"));
    const res = await login({ email: "asha@example.com", password: PASSWORD });
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain("db password");
  });
});
