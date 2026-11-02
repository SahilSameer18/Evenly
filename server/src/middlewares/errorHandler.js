import { AppError, NotFoundError } from "../utils/errors.js";

export function notFound(req, res, next) {
  next(new NotFoundError("Route not found"));
}

// Every failure leaves here as { error: { code, message, details? }, meta: { requestId } }.
// Stack traces and raw error messages are logged, never sent to the client.
// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  let status = 500;
  let error = { code: "INTERNAL", message: "Something went wrong" };

  if (err instanceof AppError) {
    status = err.status;
    error = { code: err.code, message: err.message, ...(err.details && { details: err.details }) };
  } else if (err.type === "entity.parse.failed") {
    status = 400;
    error = { code: "VALIDATION_FAILED", message: "Request body is not valid JSON" };
  } else if (err.type === "entity.too.large") {
    status = 413;
    error = { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large" };
  } else {
    req.log.error(err);
  }

  res.status(status).json({ error, meta: { requestId: req.id } });
}
