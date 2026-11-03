import * as repository from "./household.repository.js";

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
