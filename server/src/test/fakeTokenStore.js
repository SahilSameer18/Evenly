// In-memory stand-in for the RefreshToken table, used by tests that mock the auth repository.
// The check-and-mark in rotateRefreshToken has no await between them, so like the real
// conditional UPDATE it lets only one caller win.
export const rows = new Map(); // tokenHash -> row
let counter = 0;

export const reset = () => rows.clear();

export async function createRefreshToken(data) {
  const row = { id: `rt-${++counter}`, usedAt: null, revokedAt: null, createdAt: new Date(), ...data };
  rows.set(row.tokenHash, row);
  return row;
}

export async function findRefreshToken(tokenHash) {
  return rows.get(tokenHash) ?? null;
}

export async function rotateRefreshToken(oldId, next) {
  const old = [...rows.values()].find((r) => r.id === oldId);
  if (!old || old.usedAt || old.revokedAt || old.expiresAt <= new Date()) return null;
  old.usedAt = new Date();
  return createRefreshToken(next);
}
