import prisma from "../../lib/prisma.js";
import { scoped } from "../../lib/tenant.js";

// Functions that take householdId call scoped() first, so they cannot run without it.
// The ones that cannot are listed in UNSCOPED in __tests__/household.repository.test.js.

const HOUSEHOLD = { id: true, name: true, currency: true, timezone: true, defaultSplitMethod: true, createdAt: true };

export function createHousehold({ name, timezone, defaultSplitMethod, ownerId }) {
  // One nested write is one transaction: the household never exists without its owner.
  return prisma.household.create({
    data: { name, timezone, defaultSplitMethod, members: { create: { userId: ownerId, role: "owner" } } },
    select: HOUSEHOLD,
  });
}

export function listHouseholdsForUser(userId) {
  return prisma.householdMember.findMany({
    where: { userId, status: "active", household: { archivedAt: null } },
    select: { role: true, household: { select: HOUSEHOLD } },
    orderBy: { joinedAt: "asc" },
  });
}

// The tenancy check: an active member of a household that has not been archived, or null.
export function findActiveMembership(householdId, userId) {
  return prisma.householdMember.findFirst({
    where: { householdId: scoped(householdId), userId, status: "active", household: { archivedAt: null } },
    select: { householdId: true, userId: true, role: true },
  });
}

export function getHousehold(householdId) {
  return prisma.household.findUnique({
    where: { id: scoped(householdId) },
    select: {
      ...HOUSEHOLD,
      members: {
        where: { status: "active" },
        select: { role: true, joinedAt: true, user: { select: { id: true, name: true } } },
        orderBy: { joinedAt: "asc" },
      },
    },
  });
}
