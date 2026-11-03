import { createHash } from "node:crypto";

// JSON with object keys sorted, so the same data always gives the same text whatever order the keys arrived in.
// Dates become ISO strings and undefined fields are dropped, matching what JSON.stringify does.
export function canonicalJson(value) {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v === undefined ? null : v)).join(",")}]`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** SHA-256 (hex) of the canonical form. Array order still matters: a different order is a different request. */
export const hashRequest = (value) => createHash("sha256").update(canonicalJson(value)).digest("hex");
