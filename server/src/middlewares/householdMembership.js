import { findActiveMembership } from "../modules/households/household.repository.js";
import { NotFoundError } from "../utils/errors.js";

// Runs after authenticate on every /households/:householdId route. Sets req.membership = { householdId, userId, role }.
// A stranger, a member who left, an archived household and an id that does not exist all get the same 404,
// so ids cannot be probed to learn which households exist.
export async function householdMembership(req, res, next) {
  try {
    const membership = await findActiveMembership(req.params.householdId, req.user.id);
    if (!membership) throw new NotFoundError("Household not found");
    req.membership = membership;
    next();
  } catch (err) {
    next(err);
  }
}
