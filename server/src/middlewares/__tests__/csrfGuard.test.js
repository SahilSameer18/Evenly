import { describe, it, expect, vi } from "vitest";
import { csrfGuard } from "../csrfGuard.js";
import env from "../../config/env.js";

function run(headers) {
  const next = vi.fn();
  csrfGuard({ get: (name) => headers[name.toLowerCase()] }, {}, next);
  return next.mock.calls[0][0];
}

describe("csrfGuard", () => {
  it("lets a request with the custom header through", () => {
    expect(run({ "x-evenly-client": "web" })).toBeUndefined();
  });

  it("lets it through when the Origin is the configured client", () => {
    expect(run({ "x-evenly-client": "web", origin: env.CLIENT_ORIGIN })).toBeUndefined();
  });

  it.each([
    ["no custom header", {}],
    ["a wrong header value", { "x-evenly-client": "mobile" }],
    ["a foreign Origin", { "x-evenly-client": "web", origin: "https://evil.example" }],
    ["a null Origin (sandboxed pages)", { "x-evenly-client": "web", origin: "null" }],
  ])("blocks %s with 403 CSRF_BLOCKED", (_label, headers) => {
    expect(run(headers)).toMatchObject({ status: 403, code: "CSRF_BLOCKED" });
  });
});
