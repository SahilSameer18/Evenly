import { ValidationError } from "../utils/errors.js";

// Requires "Idempotency-Key: <8-64 chars of A-Z a-z 0-9 _ ->" (a UUID works) and sets req.idempotencyKey.
// The client makes the key when the form opens, so a double tap or a retry reuses it.
const VALID_KEY = /^[A-Za-z0-9_-]{8,64}$/;

export function idempotencyKey(req, res, next) {
  const key = req.get("idempotency-key");
  if (!key || !VALID_KEY.test(key)) {
    const message = key ? "Use 8 to 64 letters, digits, hyphens or underscores" : "Required";
    return next(new ValidationError([{ in: "header", field: "Idempotency-Key", message }]));
  }
  req.idempotencyKey = key;
  next();
}
