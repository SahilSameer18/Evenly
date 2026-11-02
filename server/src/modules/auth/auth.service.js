import { randomBytes, randomUUID } from "node:crypto";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import { signAccessToken, newRefreshToken, hashToken, REFRESH_TTL_MS } from "../../lib/tokens.js";
import logger from "../../lib/logger.js";
import { AppError, ConflictError, UnauthenticatedError } from "../../utils/errors.js";
import * as repository from "./auth.repository.js";

// A replay inside this window is treated as two tabs racing, not theft.
// shortcut: a thief replaying within 10 s of the real client is not caught; drop the window once the client serialises its refresh calls.
const REUSE_GRACE_MS = 10_000;

// Verified against when the email is unknown, so "no such account" costs the same time as "wrong password".
const dummyHash = hashPassword(randomBytes(16).toString("hex"));

export async function login({ email, password }) {
  const user = await repository.findUserByEmail(email);
  const passwordOk = await verifyPassword(user?.passwordHash ?? (await dummyHash), password);
  if (!user || !passwordOk) {
    throw new UnauthenticatedError("Invalid email or password", "INVALID_CREDENTIALS");
  }
  const publicUser = { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt };
  return { user: publicUser, ...(await startSession(user.id)) };
}

// A new login starts a new token family; every refresh in this session stays in it.
async function startSession(userId) {
  const refreshToken = newRefreshToken();
  await repository.createRefreshToken({
    userId,
    familyId: randomUUID(),
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  });
  return { accessToken: await signAccessToken(userId), refreshToken };
}

// Trade a refresh token for a new access token AND a new refresh token. The old one is spent.
export async function refresh(rawToken) {
  const invalid = () => new UnauthenticatedError("Session is no longer valid", "INVALID_SESSION");
  if (!rawToken) throw invalid();

  const current = await repository.findRefreshToken(hashToken(rawToken));
  if (!current) throw invalid();

  if (current.usedAt) {
    // A spent token came back: either two tabs raced, or someone copied it. Past the grace window, assume theft
    // and revoke the whole family, so both the thief and the real user must log in again.
    if (Date.now() - current.usedAt.getTime() > REUSE_GRACE_MS) {
      await repository.revokeFamily(current.familyId);
      logger.warn({ userId: current.userId, familyId: current.familyId }, "refresh token reuse detected, session revoked");
    }
    throw invalid();
  }

  const next = newRefreshToken();
  const created = await repository.rotateRefreshToken(current.id, {
    userId: current.userId,
    familyId: current.familyId,
    tokenHash: hashToken(next),
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  });
  if (!created) throw invalid(); // lost a race, or revoked, or expired
  return { accessToken: await signAccessToken(current.userId), refreshToken: next };
}

// Ends this login on this device only. Safe to call with no or an unknown token.
export async function logout(rawToken) {
  if (!rawToken) return;
  const current = await repository.findRefreshToken(hashToken(rawToken));
  if (current) await repository.revokeFamily(current.familyId);
}

export async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await repository.findUserWithHashById(userId);
  if (!user) throw new UnauthenticatedError();
  if (!(await verifyPassword(user.passwordHash, currentPassword))) {
    throw new AppError(403, "INVALID_CURRENT_PASSWORD", "Current password is incorrect");
  }
  await repository.updatePasswordAndRevokeSessions(userId, await hashPassword(newPassword));
  return startSession(userId); // every other device is signed out; this one gets a fresh session
}

export async function register({ email, name, password }) {
  const passwordHash = await hashPassword(password);
  try {
    return await repository.createUser({ email, name, passwordHash });
  } catch (err) {
    // The unique index on email decides, so two simultaneous sign-ups cannot both succeed.
    if (err.code === "P2002") throw new ConflictError("EMAIL_TAKEN", "An account with this email already exists");
    throw err;
  }
}
