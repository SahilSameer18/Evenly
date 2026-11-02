import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "../password.js";

describe("password hashing", () => {
  it("produces an Argon2id hash that is not the password", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(hash).not.toContain("correct horse");
  });

  it("uses a fresh salt, so the same password hashes differently each time", async () => {
    const [a, b] = await Promise.all([hashPassword("same-password"), hashPassword("same-password")]);
    expect(a).not.toBe(b);
    expect(await verifyPassword(a, "same-password")).toBe(true);
    expect(await verifyPassword(b, "same-password")).toBe(true);
  });

  it("accepts the right password and rejects a wrong one", async () => {
    const hash = await hashPassword("s3cret-Pass!");
    expect(await verifyPassword(hash, "s3cret-Pass!")).toBe(true);
    expect(await verifyPassword(hash, "s3cret-Pass")).toBe(false);
    expect(await verifyPassword(hash, "")).toBe(false);
  });

  it("handles unicode and long passwords with no silent truncation", async () => {
    const long = "a".repeat(200);
    const hash = await hashPassword(long);
    expect(await verifyPassword(hash, long)).toBe(true);
    expect(await verifyPassword(hash, "a".repeat(199))).toBe(false);
    expect(await verifyPassword(await hashPassword("pässwörd-🔒"), "pässwörd-🔒")).toBe(true);
  });

  it("returns false, not an error, for a stored value that is not a hash", async () => {
    expect(await verifyPassword("!seed-account-no-login", "anything")).toBe(false);
    expect(await verifyPassword("", "anything")).toBe(false);
  });

  it("refuses to hash an empty or non-string password", () => {
    expect(() => hashPassword("")).toThrow(TypeError);
    expect(() => hashPassword(undefined)).toThrow(TypeError);
  });
});
