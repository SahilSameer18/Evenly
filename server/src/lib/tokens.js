import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify, errors } from "jose";
import env from "../config/env.js";
import { UnauthenticatedError } from "../utils/errors.js";

const secret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
const ISSUER = "evenly";
const AUDIENCE = "evenly-api";

export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// Access token: a signed JWT, valid for 15 minutes. The server checks the signature, not the database.
export function signAccessToken(userId) {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(secret);
}

/** @returns {Promise<string>} the user id the token was issued to */
export async function verifyAccessToken(token) {
  try {
    // Pinning the algorithm blocks "alg: none" and algorithm-swap tricks.
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"], issuer: ISSUER, audience: AUDIENCE });
    if (!payload.sub) throw new Error("token has no subject");
    return payload.sub;
  } catch (err) {
    if (err instanceof errors.JWTExpired) throw new UnauthenticatedError("Access token expired", "TOKEN_EXPIRED");
    throw new UnauthenticatedError("Invalid access token");
  }
}

// Refresh token: 256 random bits with no meaning. Only its SHA-256 hash is stored, so a database leak
// cannot be replayed. A fast hash is fine here because the input is already unguessable (unlike a password).
export const newOpaqueToken = () => randomBytes(32).toString("base64url"); // also used for invitation links
export const newRefreshToken = newOpaqueToken;
export const hashToken = (token) => createHash("sha256").update(token).digest("hex");
