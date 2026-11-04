import { hashToken, newOpaqueToken } from "../../lib/tokens.js";
import { AppError, ConflictError, ForbiddenError, ValidationError } from "../../utils/errors.js";
import * as balances from "../balances/balance.service.js";
import * as repository from "./household.repository.js";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PENDING_INVITES = 10;

const present = (household, myRole) => ({ ...household, myRole });

export async function createHousehold(userId, body) {
  return present(await repository.createHousehold({ ...body, ownerId: userId }), "owner");
}

export async function listMyHouseholds(userId) {
  const rows = await repository.listHouseholdsForUser(userId);
  return rows.map((r) => present(r.household, r.role));
}

export async function getHousehold(membership) {
  const { members, ...household } = await repository.getHousehold(membership.householdId);
  return {
    ...present(household, membership.role),
    // Names only: roommates do not get each other's email addresses.
    members: members.map((m) => ({ userId: m.user.id, name: m.user.name, role: m.role, joinedAt: m.joinedAt })),
  };
}

function requireOwner(membership) {
  if (membership.role !== "owner") throw new ForbiddenError("Only the household owner can do this");
}

export async function createInvitation(membership, { email }) {
  requireOwner(membership);
  if ((await repository.countPendingInvitations(membership.householdId)) >= MAX_PENDING_INVITES) {
    throw new ConflictError("INVITE_LIMIT_REACHED", "Too many open invitations: wait for them to be used or expire");
  }
  // Only the hash is stored, so a database leak cannot be turned into working links. The token is shown once.
  const token = newOpaqueToken();
  const invitation = await repository.createInvitation(membership.householdId, {
    invitedById: membership.userId,
    tokenHash: hashToken(token),
    invitedEmail: email ?? null,
    expiresAt: new Date(Date.now() + INVITE_TTL_MS),
  });
  return { invitation, token };
}

export async function acceptInvitation(userId, token) {
  // One answer for every failure (unknown, used, expired, wrong email, archived), so nothing can be probed.
  const invalid = () => new AppError(400, "INVALID_INVITATION", "This invitation is invalid or has expired");

  const invitation = await repository.findInvitationByTokenHash(hashToken(token));
  if (!invitation || invitation.usedAt || invitation.expiresAt <= new Date() || invitation.household.archivedAt) throw invalid();
  if (invitation.invitedEmail) {
    const user = await repository.findUserEmail(userId);
    if (user?.email !== invitation.invitedEmail) throw invalid();
  }

  const result = await repository.acceptInvitation(invitation.householdId, invitation.id, userId);
  if (result === "invalid") throw invalid();
  if (result === "already_member") throw new ConflictError("ALREADY_MEMBER", "You are already in this household");
  return getHousehold({ householdId: invitation.householdId, role: "member" });
}

export async function updateHousehold(membership, body) {
  requireOwner(membership);
  return present(await repository.updateHousehold(membership.householdId, body), membership.role);
}

export async function leave(membership, { newOwnerId }) {
  const { householdId, userId, role } = membership;

  const state = await balances.loadState(householdId);
  const { members, settlements } = state;

  // A repayment still waiting for an answer would be left hanging, so it has to be settled first.
  if (settlements.some((t) => t.status === "pending" && (t.fromUserId === userId || t.toUserId === userId))) {
    throw new ConflictError("HAS_PENDING_REPAYMENTS", "You have a repayment waiting to be confirmed, rejected or cancelled");
  }
  if (balances.netOf(state)[userId] !== 0) throw new ConflictError("BALANCE_NOT_ZERO", "Settle up before leaving: your balance is not zero");

  const others = members.filter((m) => m.status === "active" && m.userId !== userId);
  const badOwner = (message) => new ValidationError([{ in: "body", field: "newOwnerId", message }]);
  let archive = false;
  if (role === "owner") {
    if (others.length === 0) {
      archive = true; // the last person out closes the household
    } else if (!newOwnerId) {
      throw new ConflictError("OWNERSHIP_TRANSFER_REQUIRED", "Choose a new owner before leaving");
    } else if (!others.some((m) => m.userId === newOwnerId)) {
      throw badOwner("Must be another active member");
    }
  } else if (newOwnerId) {
    throw badOwner("Only the owner can name a new owner");
  }

  await repository.leaveHousehold(householdId, { userId, newOwnerId: role === "owner" ? newOwnerId : undefined, archive });
  return { left: true, archived: archive };
}
