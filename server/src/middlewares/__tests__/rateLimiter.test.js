import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { createLimiter } from "../rateLimiter.js";
import { errorHandler } from "../errorHandler.js";
import app from "../../app.js";

// ?fail=1 makes the route answer 401, standing in for a failed login.
function tinyApp(limiter) {
  const a = express();
  a.get("/ping", limiter, (req, res) => res.status(req.query.fail ? 401 : 200).json({ ok: true }));
  a.use(errorHandler);
  return a;
}

describe("createLimiter", () => {
  it("allows requests up to the limit, then answers 429 RATE_LIMITED", async () => {
    const a = tinyApp(createLimiter({ windowMs: 60_000, limit: 3 }));
    for (let i = 0; i < 3; i++) expect((await request(a).get("/ping")).status).toBe(200);
    const blocked = await request(a).get("/ping");
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("RATE_LIMITED");
  });

  it("with skipSuccessfulRequests, only failures use up the allowance", async () => {
    const a = tinyApp(createLimiter({ windowMs: 60_000, limit: 2, skipSuccessfulRequests: true }));
    for (let i = 0; i < 5; i++) expect((await request(a).get("/ping")).status).toBe(200);
    expect((await request(a).get("/ping?fail=1")).status).toBe(401);
    expect((await request(a).get("/ping?fail=1")).status).toBe(401);
    expect((await request(a).get("/ping?fail=1")).status).toBe(429);
  });
});

describe("limiters are attached to the auth routes", () => {
  it.each(["register", "login", "refresh", "change-password"])("POST /api/v1/auth/%s sends rate limit headers", async (route) => {
    const res = await request(app).post(`/api/v1/auth/${route}`).send({});
    expect(res.headers["ratelimit-policy"]).toBeTruthy();
  });
});
