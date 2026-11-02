import prisma from "../../lib/prisma.js";

export function findUserById(id) {
  return prisma.user.findUnique({ where: { id }, select: { id: true, email: true, name: true, createdAt: true } });
}
