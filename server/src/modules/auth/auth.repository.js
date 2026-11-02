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

export function createUser({ email, name, passwordHash }) {
  return prisma.user.create({ data: { email, name, passwordHash }, select: PUBLIC_USER });
}
