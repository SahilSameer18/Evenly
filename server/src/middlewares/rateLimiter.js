import { rateLimit } from "express-rate-limit";
import env from "../config/env.js";
import { AppError } from "../utils/errors.js";

// shortcut: counters live in this process's memory, per IP. They reset on restart and are not shared
// between instances; move to a shared store (Redis) before running more than one server.
export function createLimiter({ windowMs, limit, skipSuccessfulRequests = false }) {
  return rateLimit({
    windowMs,
    limit,
    skipSuccessfulRequests,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (req, res, next) => next(new AppError(429, "RATE_LIMITED", "Too many attempts, try again later")),
  });
}

// Tests share one IP and make hundreds of calls, so the real limits are lifted there.
// The limiter itself is tested directly in __tests__/rateLimiter.test.js.
const testing = env.NODE_ENV === "test";
const MINUTE = 60 * 1000;

export const registerLimiter = createLimiter({ windowMs: 60 * MINUTE, limit: testing ? 10_000 : 5 });
// Only failed logins count, so a real user is never locked out by their own successes.
export const loginLimiter = createLimiter({ windowMs: 15 * MINUTE, limit: testing ? 10_000 : 10, skipSuccessfulRequests: true });
export const refreshLimiter = createLimiter({ windowMs: 15 * MINUTE, limit: testing ? 10_000 : 60 });
// A stolen access token could otherwise be used to guess the current password.
export const passwordLimiter = createLimiter({ windowMs: 15 * MINUTE, limit: testing ? 10_000 : 5 });
