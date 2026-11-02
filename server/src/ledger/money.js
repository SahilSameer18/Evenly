import { LedgerError } from "./errors.js";

/**
 * Parse a user-typed amount ("1,250.5") into integer paise without any float maths.
 * @param {string} input
 * @returns {number}
 */
export function toMinor(input) {
  if (typeof input !== "string") throw new LedgerError("INVALID_AMOUNT", "Amount must be a string");
  const m = input.replace(/,/g, "").trim().match(/^(\d*)(?:\.(\d{1,2}))?$/);
  if (!m || (!m[1] && !m[2])) throw new LedgerError("INVALID_AMOUNT", `Invalid amount: "${input}"`);
  const paise = Number(m[1] || 0) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(paise)) throw new LedgerError("INVALID_AMOUNT", "Amount too large");
  return paise;
}

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

/** DISPLAY ONLY. Never feed the result back into calculations. */
export function formatMoney(minor) {
  return inr.format(minor / 100);
}
