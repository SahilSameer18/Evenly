import { LedgerError } from "./errors.js";

// FNV-1a: deterministic and pure, so leftover paise are spread fairly across
// expenses instead of always landing on the same person.
function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

function assertTotal(totalMinor) {
  if (!Number.isSafeInteger(totalMinor) || totalMinor < 0) {
    throw new LedgerError("INVALID_AMOUNT", "Total must be a non-negative integer (paise)");
  }
}

function assertUniqueIds(ids) {
  if (ids.length === 0) throw new LedgerError("SPLIT_EMPTY", "Split needs at least one person");
  if (new Set(ids).size !== ids.length) throw new LedgerError("SPLIT_DUPLICATE_USER");
}

/**
 * Largest-remainder split. Ties on the remainder are broken by hash(seed, userId),
 * then userId, so the result never depends on input order.
 * @param {number} totalMinor
 * @param {{ userId: string, weight: number }[]} parts
 * @param {string} seed usually the expense id
 * @returns {{ userId: string, shareMinor: number }[]} sorted by userId
 */
export function splitByWeights(totalMinor, parts, seed) {
  assertTotal(totalMinor);
  if (typeof seed !== "string" || !seed) throw new LedgerError("SPLIT_SEED_REQUIRED");
  assertUniqueIds(parts.map((p) => p.userId));
  if (parts.some((p) => !Number.isSafeInteger(p.weight) || p.weight <= 0)) {
    throw new LedgerError("SPLIT_INVALID_WEIGHT", "Weights must be positive integers");
  }
  const totalWeight = parts.reduce((sum, p) => sum + p.weight, 0);

  const rows = parts.map(({ userId, weight }) => {
    const num = totalMinor * weight;
    if (!Number.isSafeInteger(num)) throw new LedgerError("INVALID_AMOUNT", "Amount too large");
    return { userId, share: Math.floor(num / totalWeight), rem: num % totalWeight, tie: hash(`${seed}:${userId}`) };
  });

  let left = totalMinor - rows.reduce((sum, r) => sum + r.share, 0);
  const byPriority = [...rows].sort(
    (a, b) => b.rem - a.rem || a.tie - b.tie || a.userId.localeCompare(b.userId),
  );
  for (const r of byPriority) {
    if (left === 0) break;
    r.share += 1;
    left -= 1;
  }

  return rows
    .map(({ userId, share }) => ({ userId, shareMinor: share }))
    .sort((a, b) => a.userId.localeCompare(b.userId));
}

export function splitEqual(totalMinor, userIds, seed) {
  return splitByWeights(totalMinor, userIds.map((userId) => ({ userId, weight: 1 })), seed);
}

/** @param {{ userId: string, bps: number }[]} parts basis points, must total 10000 */
export function splitByBasisPoints(totalMinor, parts, seed) {
  if (parts.reduce((sum, p) => sum + p.bps, 0) !== 10000) throw new LedgerError("BPS_SUM_INVALID");
  return splitByWeights(totalMinor, parts.map((p) => ({ userId: p.userId, weight: p.bps })), seed);
}

/** @param {{ userId: string, shareMinor: number }[]} shares must total totalMinor */
export function splitExact(totalMinor, shares) {
  assertTotal(totalMinor);
  assertUniqueIds(shares.map((s) => s.userId));
  if (shares.some((s) => !Number.isSafeInteger(s.shareMinor) || s.shareMinor < 0)) {
    throw new LedgerError("SPLIT_INVALID_SHARE", "Shares must be non-negative integers");
  }
  if (shares.reduce((sum, s) => sum + s.shareMinor, 0) !== totalMinor) {
    throw new LedgerError("SPLIT_MISMATCH", "Shares do not add up to the total");
  }
  return [...shares].sort((a, b) => a.userId.localeCompare(b.userId));
}
