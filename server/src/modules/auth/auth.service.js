import { randomBytes } from "node:crypto";
import { hashPassword, verifyPassword } from "../../lib/password.js";
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
  return { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt };
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
