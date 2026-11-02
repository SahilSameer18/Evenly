import { describe, it, expect, vi } from "vitest";
import { errorHandler, notFound } from "../errorHandler.js";
import { ForbiddenError, ValidationError } from "../../utils/errors.js";

function run(err) {
  const req = { id: "req-1", log: { error: vi.fn() } };
  const res = {
    headersSent: false,
    status(code) {
      this.code = code;
      return this;
    },
    json(body) {
      this.body = body;
    },
  };
  errorHandler(err, req, res, vi.fn());
  return { req, res };
}

describe("errorHandler", () => {
  it("maps a thrown AppError to its status, code and details", () => {
    const { res } = run(new ValidationError([{ field: "email", message: "Required" }]));
    expect(res.code).toBe(400);
    expect(res.body).toEqual({
      error: { code: "VALIDATION_FAILED", message: "Validation failed", details: [{ field: "email", message: "Required" }] },
      meta: { requestId: "req-1" },
    });
  });

  it("omits details when there are none", () => {
    expect(run(new ForbiddenError()).res.body.error).toEqual({ code: "FORBIDDEN", message: "Not allowed" });
  });

  it("hides the message and stack of unexpected errors but logs them", () => {
    const boom = new Error("secret database detail");
    const { req, res } = run(boom);
    expect(res.code).toBe(500);
    expect(res.body.error).toEqual({ code: "INTERNAL", message: "Something went wrong" });
    expect(JSON.stringify(res.body)).not.toContain("secret");
    expect(req.log.error).toHaveBeenCalledWith(boom);
  });

  it("turns malformed JSON into a 400 and oversized bodies into a 413", () => {
    expect(run(Object.assign(new Error("x"), { type: "entity.parse.failed" })).res.code).toBe(400);
    expect(run(Object.assign(new Error("x"), { type: "entity.too.large" })).res.code).toBe(413);
  });

  it("passes the error on if a response was already started", () => {
    const next = vi.fn();
    const err = new Error("late");
    errorHandler(err, { id: "r", log: { error: vi.fn() } }, { headersSent: true }, next);
    expect(next).toHaveBeenCalledWith(err);
  });
});

describe("notFound", () => {
  it("forwards a 404 AppError", () => {
    const next = vi.fn();
    notFound({}, {}, next);
    expect(next.mock.calls[0][0]).toMatchObject({ status: 404, code: "NOT_FOUND" });
  });
});
