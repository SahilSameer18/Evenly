import { LedgerError } from "./errors.js";
import { splitByWeights } from "./split.js";

/**
 * Split a refund across the original beneficiaries in proportion to what each originally owed.
 * Returns positive shares; the caller records the refund as an expense with negated amounts.
 * @param {{ userId: string, shareMinor: number }[]} originalSplits
 * @param {number} refundMinor
 * @param {string} seed
 */
export function calculateRefundShares(originalSplits, refundMinor, seed) {
  const payers = originalSplits.filter((s) => s.shareMinor > 0);
  const originalTotal = payers.reduce((sum, s) => sum + s.shareMinor, 0);
  if (!Number.isSafeInteger(refundMinor) || refundMinor <= 0 || refundMinor > originalTotal) {
    throw new LedgerError("INVALID_REFUND", "Refund must be positive and not exceed the original amount");
  }
  return splitByWeights(refundMinor, payers.map((s) => ({ userId: s.userId, weight: s.shareMinor })), seed);
}
