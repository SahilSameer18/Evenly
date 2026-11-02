import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../app.js";

describe("app", () => {
  it("GET /health returns ok and a request id", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
    expect(res.headers["x-request-id"]).toBeTruthy();
  });

  it("echoes a safe request id sent by the caller", async () => {
    const res = await request(app).get("/health").set("X-Request-Id", "trace-abc-12345");
    expect(res.headers["x-request-id"]).toBe("trace-abc-12345");
  });

  it("returns the error envelope for unknown routes", async () => {
    const res = await request(app).get("/nope");
    expect(res.status).toBe(404);
    expect(res.body.error).toEqual({ code: "NOT_FOUND", message: "Route not found" });
    expect(res.body.meta.requestId).toBe(res.headers["x-request-id"]);
  });

  it("returns a 400 for malformed JSON", async () => {
    const res = await request(app).post("/anything").set("Content-Type", "application/json").send("{bad");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
  });

  it.skipIf(!process.env.TEST_DATABASE_URL)("GET /ready reaches the test database", async () => {
    const res = await request(app).get("/ready");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ready" });
  });
});
