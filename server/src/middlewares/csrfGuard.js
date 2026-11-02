import env from "../config/env.js";
import { AppError } from "../utils/errors.js";

// For endpoints that act on the refresh cookie. A cross-site form or image cannot add a custom header,
// and a cross-origin fetch that adds one first needs a CORS preflight, which only CLIENT_ORIGIN passes.
// The Origin check is a second layer for requests that carry one.
export function csrfGuard(req, res, next) {
  const origin = req.get("origin");
  if (req.get("x-evenly-client") !== "web" || (origin && origin !== env.CLIENT_ORIGIN)) {
    return next(new AppError(403, "CSRF_BLOCKED", "Request blocked"));
  }
  next();
}
