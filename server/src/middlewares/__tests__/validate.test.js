import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { validate } from "../validate.js";
import { ValidationError } from "../../utils/errors.js";

function run(schemas, req) {
  const next = vi.fn();
  validate(schemas)(req, {}, next);
  return { req, next, error: next.mock.calls[0][0] };
}

const body = z.strictObject({ email: z.string().trim().toLowerCase().pipe(z.email()), age: z.number().int().optional() });

describe("validate", () => {
  it("passes cleaned values to req.valid and calls next with no error", () => {
    const { req, next, error } = run({ body }, { body: { email: "  Asha@Example.COM " } });
    expect(error).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.valid.body).toEqual({ email: "asha@example.com" });
  });

  it("rejects a bad field and names it", () => {
    const { error } = run({ body }, { body: { email: "not-an-email" } });
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.status).toBe(400);
    expect(error.details).toEqual([expect.objectContaining({ in: "body", field: "email" })]);
  });

  it("rejects unknown keys", () => {
    const { error } = run({ body }, { body: { email: "a@b.co", isAdmin: true } });
    expect(error.details).toEqual([expect.objectContaining({ in: "body", field: "isAdmin" })]);
  });

  it("rejects a missing body", () => {
    expect(run({ body }, { body: undefined }).error).toBeInstanceOf(ValidationError);
  });

  it("checks params and query, and collects every problem at once", () => {
    const schemas = {
      body,
      params: z.strictObject({ id: z.string().min(5) }),
      query: z.strictObject({ limit: z.coerce.number().int().max(100).default(25) }),
    };
    const bad = run(schemas, { body: { email: "x" }, params: { id: "abc" }, query: { limit: "500" } });
    expect(bad.error.details.map((d) => d.in).sort()).toEqual(["body", "params", "query"]);

    const good = run(schemas, { body: { email: "a@b.co" }, params: { id: "abcde" }, query: {} });
    expect(good.error).toBeUndefined();
    expect(good.req.valid.query).toEqual({ limit: 25 });
  });

  it("only validates the parts it was given", () => {
    const { req, error } = run({ params: z.strictObject({ id: z.string() }) }, { params: { id: "x" }, body: { anything: 1 } });
    expect(error).toBeUndefined();
    expect(Object.keys(req.valid)).toEqual(["params"]);
  });
});
