import { randomBytes, randomUUID } from "node:crypto";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import { signAccessToken, newRefreshToken, hashToken, REFRESH_TTL_MS } from "../../lib/tokens.js";
import { ConflictError, UnauthenticatedError } from "../../utils/errors.js";
import * as repository from "./auth.repository.js";

// Verified against when the email is unknown, so "no such account" costs the same time as "wrong password".
const dummyHash = hashPassword(randomBytes(16).toString("hex"));

export async function login({ email, password }) {
  const user = await repository.findUserByEmail(email);
  const passwordOk = await verifyPassword(user?.passwordHash ?? (await dummyHash), password);
  if (!user || !passwordOk) {
    throw new UnauthenticatedError("Invalid email or password", "INVALID_CREDENTIALS");
  }
  const publicUser = { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt };
  // A new login starts a new token family; every refresh in this session stays in it.
  const refreshToken = newRefreshToken();
  await repository.createRefreshToken({
    userId: user.id,
    familyId: randomUUID(),
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  });
  return { user: publicUser, accessToken: await signAccessToken(user.id), refreshToken };
}

// Trade a refresh token for a new access token AND a new refresh token. The old one is spent.
export async function refresh(rawToken) {
  const invalid = () => new UnauthenticatedError("Session is no longer valid", "INVALID_SESSION");
  if (!rawToken) throw invalid();

  const current = await repository.findRefreshToken(hashToken(rawToken));
  if (!current) throw invalid();

  const next = newRefreshToken();
  const created = await repository.rotateRefreshToken(current.id, {
    userId: current.userId,
    familyId: current.familyId,
    tokenHash: hashToken(next),
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  });
  if (!created) throw invalid(); // already used, revoked or expired
  return { accessToken: await signAccessToken(current.userId), refreshToken: next };
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
