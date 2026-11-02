import argon2 from "argon2";

// Argon2id with the library's default cost (64 MiB memory, 3 passes). The random salt and
// every cost setting are stored inside the returned string, so verify needs nothing else.
export function hashPassword(plain) {
  if (typeof plain !== "string" || plain === "") throw new TypeError("Password must be a non-empty string");
  return argon2.hash(plain, { type: argon2.argon2id });
}

// Returns false for a wrong password AND for a stored value that is not a valid hash
// (for example the seed users' placeholder), so callers need no try/catch.
export async function verifyPassword(hash, plain) {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}
