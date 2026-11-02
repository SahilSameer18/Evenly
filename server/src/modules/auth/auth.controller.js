import env from "../../config/env.js";
import { ACCESS_TTL_SECONDS, REFRESH_TTL_MS } from "../../lib/tokens.js";
import { UnauthenticatedError } from "../../utils/errors.js";
import { sendData } from "../../utils/response.js";
import * as service from "./auth.service.js";

export const REFRESH_COOKIE = "refresh_token";

// HttpOnly: page scripts cannot read it. Path: the browser sends it only to auth endpoints.
// SameSite=Lax: other sites cannot make the browser attach it to cross-site POSTs.
// Secure is off outside production only so plain http://localhost works.
const cookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/api/v1/auth",
};

const setRefreshCookie = (res, token) => res.cookie(REFRESH_COOKIE, token, { ...cookieOptions, maxAge: REFRESH_TTL_MS });

export async function register(req, res) {
  const user = await service.register(req.valid.body);
  sendData(req, res, { user }, 201);
}

export async function login(req, res) {
  const { user, accessToken, refreshToken } = await service.login(req.valid.body);
  setRefreshCookie(res, refreshToken);
  sendData(req, res, { user, accessToken, expiresIn: ACCESS_TTL_SECONDS });
}

export async function logout(req, res) {
  await service.logout(req.cookies?.[REFRESH_COOKIE]);
  res.clearCookie(REFRESH_COOKIE, cookieOptions);
  sendData(req, res, { loggedOut: true });
}

export async function changePassword(req, res) {
  const { accessToken, refreshToken } = await service.changePassword(req.user.id, req.valid.body);
  setRefreshCookie(res, refreshToken);
  sendData(req, res, { accessToken, expiresIn: ACCESS_TTL_SECONDS });
}

export async function refresh(req, res) {
  try {
    const { accessToken, refreshToken } = await service.refresh(req.cookies?.[REFRESH_COOKIE]);
    setRefreshCookie(res, refreshToken);
    sendData(req, res, { accessToken, expiresIn: ACCESS_TTL_SECONDS });
  } catch (err) {
    if (err instanceof UnauthenticatedError) res.clearCookie(REFRESH_COOKIE, cookieOptions);
    throw err;
  }
}
