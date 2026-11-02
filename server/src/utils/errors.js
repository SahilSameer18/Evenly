// Errors we throw on purpose. `code` is a stable string clients can rely on; `message` may change.
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(details, message = "Validation failed") {
    super(400, "VALIDATION_FAILED", message, details);
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = "Authentication required", code = "UNAUTHENTICATED") {
    super(401, code, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Not allowed") {
    super(403, "FORBIDDEN", message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(404, "NOT_FOUND", message);
  }
}

export class ConflictError extends AppError {
  constructor(code, message) {
    super(409, code, message);
  }
}

