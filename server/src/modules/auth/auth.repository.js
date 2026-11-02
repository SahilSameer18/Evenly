import prisma from "../../lib/prisma.js";

// Never select passwordHash for anything that can reach a response.
const PUBLIC_USER = { id: true, email: true, name: true, createdAt: true };

// The only read that includes passwordHash. Use it for login and nothing else.
export function findUserByEmail(email) {
  return prisma.user.findUnique({ where: { email }, select: { ...PUBLIC_USER, passwordHash: true } });
}

export function createUser({ email, name, passwordHash }) {
  return prisma.user.create({ data: { email, name, passwordHash }, select: PUBLIC_USER });
}
