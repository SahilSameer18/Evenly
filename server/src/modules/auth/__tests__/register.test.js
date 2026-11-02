import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../auth.repository.js", () => ({ createUser: vi.fn() }));

const { default: app } = await import("../../../app.js");
const repository = await import("../auth.repository.js");

const valid = { email: "Asha@Example.com ", password: "correct-horse-1", name: " Asha " };

beforeEach(() => {
  repository.createUser.mockReset();
  repository.createUser.mockImplementation(async ({ email, name }) => ({
    id: "user-1",
    email,
    name,
    createdAt: new Date("2026-11-02T00:00:00Z"),
  }));
});

const register = (body) => request(app).post("/api/v1/auth/register").send(body);

describe("POST /api/v1/auth/register", () => {
  it("creates the user with a cleaned email and a hashed password, and returns no secrets", async () => {
    const res = await register(valid);
    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({ id: "user-1", email: "asha@example.com", name: "Asha" });
    expect(res.body.meta.requestId).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toMatch(/password|argon2/i);

    const saved = repository.createUser.mock.calls[0][0];
    expect(saved.email).toBe("asha@example.com");
    expect(saved.passwordHash.startsWith("$argon2id$")).toBe(true);
    expect(JSON.stringify(saved)).not.toContain("correct-horse-1");
  });

  it("returns 409 EMAIL_TAKEN when the unique index rejects the email", async () => {
    repository.createUser.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    const res = await register(valid);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_TAKEN");
  });

  it("returns 500 INTERNAL and leaks nothing for unexpected failures", async () => {
    repository.createUser.mockRejectedValue(new Error("connection string leaked here"));
    const res = await register(valid);
    expect(res.status).toBe(500);
    expect(res.body.error).toEqual({ code: "INTERNAL", message: "Something went wrong" });
  });

  it.each([
    ["a bad email", { ...valid, email: "not-an-email" }, "email"],
    ["a short password", { ...valid, password: "short" }, "password"],
    ["an overlong password", { ...valid, password: "x".repeat(129) }, "password"],
    ["a blank name", { ...valid, name: "   " }, "name"],
    ["an unknown field", { ...valid, isAdmin: true }, "isAdmin"],
  ])("rejects %s with a 400 naming the field, and never touches the database", async (_label, body, field) => {
    const res = await register(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(res.body.error.details.map((d) => d.field)).toContain(field);
    expect(repository.createUser).not.toHaveBeenCalled();
  });

  it("rejects a missing body", async () => {
    const res = await request(app).post("/api/v1/auth/register");
    expect(res.status).toBe(400);
    expect(repository.createUser).not.toHaveBeenCalled();
  });
});
