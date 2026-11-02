import { verifyAccessToken } from "../lib/tokens.js";
import { UnauthenticatedError } from "../utils/errors.js";

// Requires "Authorization: Bearer <access token>" and sets req.user = { id }.
// It trusts the signature and expiry only; it does not look the user up, so a deleted account
// stays valid until its token expires (15 minutes at most).
export async function authenticate(req, res, next) {
  const [scheme, token] = (req.get("authorization") ?? "").split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return next(new UnauthenticatedError());
  try {
    req.user = { id: await verifyAccessToken(token) };
    next();
  } catch (err) {
    next(err);
  }
}
