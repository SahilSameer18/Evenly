import { describe, it, expect } from "vitest";
import { parseEnv } from "../env.js";

const base = { DATABASE_URL: "postgres://pooled", DIRECT_URL: "postgres://direct", JWT_ACCESS_SECRET: "x".repeat(32) };

describe("TRUST_PROXY", () => {
  it("defaults to one proxy (the host alone)", () => {
    expect(parseEnv(base).TRUST_PROXY).toBe(1);
  });

  it("reads a number from the environment, which is a string there", () => {
    expect(parseEnv({ ...base, TRUST_PROXY: "2" }).TRUST_PROXY).toBe(2);
    expect(parseEnv({ ...base, TRUST_PROXY: "0" }).TRUST_PROXY).toBe(0);
  });

  it("treats a blank value as not set, never as 0 (which would trust no proxy at all)", () => {
    expect(parseEnv({ ...base, TRUST_PROXY: "" }).TRUST_PROXY).toBe(1);
  });

  it.each(["-1", "6", "two", "1.5"])("refuses %j with a clear message", (value) => {
    expect(() => parseEnv({ ...base, TRUST_PROXY: value })).toThrow(/TRUST_PROXY/);
  });
});

describe("the rest of the environment", () => {
  it("still requires the secrets", () => {
    expect(() => parseEnv({ ...base, JWT_ACCESS_SECRET: "short" })).toThrow(/JWT_ACCESS_SECRET/);
    expect(() => parseEnv({ DIRECT_URL: "x", JWT_ACCESS_SECRET: "x".repeat(32) })).toThrow(/DATABASE_URL/);
  });

  it("requires CLIENT_ORIGIN to be a real URL, since CORS and the CSRF check compare against it", () => {
    expect(() => parseEnv({ ...base, CLIENT_ORIGIN: "evenly-s.vercel.app" })).toThrow(/CLIENT_ORIGIN/);
    expect(parseEnv({ ...base, CLIENT_ORIGIN: "https://evenly-s.vercel.app" }).CLIENT_ORIGIN).toBe("https://evenly-s.vercel.app");
  });
});
