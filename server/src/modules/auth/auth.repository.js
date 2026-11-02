import prisma from "../../lib/prisma.js";

// Never select passwordHash for anything that can reach a response.
const PUBLIC_USER = { id: true, email: true, name: true, createdAt: true };

// The only read that includes passwordHash. Use it for login and nothing else.
export function findUserByEmail(email) {
  return prisma.user.findUnique({ where: { email }, select: { ...PUBLIC_USER, passwordHash: true } });
}

export function createRefreshToken({ userId, familyId, tokenHash, expiresAt }) {
  return prisma.refreshToken.create({ data: { userId, familyId, tokenHash, expiresAt } });
}

export function findRefreshToken(tokenHash) {
  return prisma.refreshToken.findUnique({ where: { tokenHash } });
}

// Marks the old token used and stores its replacement in one transaction.
// The conditional update means two requests presenting the same token cannot both win; the loser gets null.
export function rotateRefreshToken(oldId, next) {
  return prisma.$transaction(async (tx) => {
    const used = await tx.refreshToken.updateMany({
      where: { id: oldId, usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (used.count !== 1) return null;
    return tx.refreshToken.create({ data: next });
  });
}

// Kills every refresh token from one login (reuse detection, logout).
export function revokeFamily(familyId) {
  return prisma.refreshToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: new Date() } });
}

// Second read that includes passwordHash: only for checking the current password on a password change.
export function findUserWithHashById(id) {
  return prisma.user.findUnique({ where: { id }, select: { id: true, passwordHash: true } });
}

// New password and every session revoked, or neither.
export function updatePasswordAndRevokeSessions(userId, passwordHash) {
  return prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
}

export function createUser({ email, name, passwordHash }) {
  return prisma.user.create({ data: { email, name, passwordHash }, select: PUBLIC_USER });
}
