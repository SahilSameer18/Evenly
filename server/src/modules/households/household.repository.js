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

export function countPendingInvitations(householdId) {
  return prisma.invitation.count({ where: { householdId: scoped(householdId), usedAt: null, expiresAt: { gt: new Date() } } });
}

export function createInvitation(householdId, { invitedById, tokenHash, invitedEmail, expiresAt }) {
  return prisma.invitation.create({
    data: { householdId: scoped(householdId), invitedById, tokenHash, invitedEmail, expiresAt },
    select: { id: true, expiresAt: true, invitedEmail: true },
  });
}

// The accepter is not a member yet, so this lookup cannot be scoped.
export function findInvitationByTokenHash(tokenHash) {
  return prisma.invitation.findUnique({
    where: { tokenHash },
    select: { id: true, householdId: true, invitedEmail: true, usedAt: true, expiresAt: true, household: { select: { archivedAt: true } } },
  });
}

export function findUserEmail(userId) {
  return prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
}

// Uses the invitation and creates (or revives) the membership in one transaction.
// The conditional update means two simultaneous accepts of one token cannot both win.
export function acceptInvitation(householdId, invitationId, userId) {
  scoped(householdId);
  return prisma.$transaction(async (tx) => {
    const key = { householdId_userId: { householdId, userId } };
    const existing = await tx.householdMember.findUnique({ where: key });
    if (existing?.status === "active") return "already_member"; // checked first, so the invitation is not wasted

    const used = await tx.invitation.updateMany({
      where: { id: invitationId, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (used.count !== 1) return "invalid";

    // The (householdId, userId) unique index allows one row per person, so a returning member is revived.
    if (existing) {
      await tx.householdMember.update({ where: key, data: { status: "active", leftAt: null, role: "member", joinedAt: new Date() } });
    } else {
      await tx.householdMember.create({ data: { householdId, userId } });
    }
    return "joined";
  });
}

export function updateHousehold(householdId, data) {
  return prisma.household.update({ where: { id: scoped(householdId) }, data, select: HOUSEHOLD });
}

// Everything the balance check needs: all records, and every member ever (left members still own history).
export function loadLedger(householdId) {
  scoped(householdId);
  return Promise.all([
    prisma.expense.findMany({ where: { householdId }, include: { splits: true } }),
    prisma.settlement.findMany({ where: { householdId } }),
    prisma.householdMember.findMany({ where: { householdId }, select: { userId: true, status: true } }),
  ]).then(([expenses, settlements, members]) => ({ expenses, settlements, members }));
}

// New owner (if any), the leaver marked left, and the optional archive: all or nothing.
export function leaveHousehold(householdId, { userId, newOwnerId, archive }) {
  scoped(householdId);
  return prisma.$transaction(async (tx) => {
    if (newOwnerId) {
      await tx.householdMember.update({ where: { householdId_userId: { householdId, userId: newOwnerId } }, data: { role: "owner" } });
    }
    await tx.householdMember.update({
      where: { householdId_userId: { householdId, userId } },
      data: { status: "left", leftAt: new Date(), role: "member" },
    });
    if (archive) await tx.household.update({ where: { id: householdId }, data: { archivedAt: new Date() } });
  });
}
