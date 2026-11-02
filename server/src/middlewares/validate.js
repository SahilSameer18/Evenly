import { ValidationError } from "../utils/errors.js";

const PARTS = ["body", "params", "query"];

/**
 * Checks req.body / req.params / req.query against Zod schemas before any handler runs.
 * Handlers read the cleaned values from req.valid.body / .params / .query, never from the raw req.
 * Write each schema with z.strictObject(...) so unknown keys are rejected, not silently ignored.
 * @param {{ body?: import("zod").ZodType, params?: import("zod").ZodType, query?: import("zod").ZodType }} schemas
 */
export function validate(schemas) {
  return (req, res, next) => {
    const valid = {};
    const details = [];

    for (const part of PARTS) {
      if (!schemas[part]) continue;
      const result = schemas[part].safeParse(req[part]);
      if (result.success) {
        valid[part] = result.data;
      } else {
        for (const issue of result.error.issues) {
          // Unknown-key issues carry the key names in `keys` and an empty path.
          const field = issue.path.join(".") || (issue.keys ?? []).join(", ");
          details.push({ in: part, field, message: issue.message });
        }
      }
    }

    if (details.length > 0) return next(new ValidationError(details));
    req.valid = valid;
    next();
  };
}
