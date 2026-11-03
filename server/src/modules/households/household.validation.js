import { z } from "zod";

// Intl accepts real zone names such as Asia/Kolkata; the pattern keeps out odd forms like "+05:30".
const validTimezone = (tz) => {
  if (!/^[A-Za-z]+(?:\/[A-Za-z0-9_+-]+)+$/.test(tz) && tz !== "UTC") return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

export const householdParams = z.strictObject({ householdId: z.string().min(1).max(64) });

// The body is optional: an invitation without an email is open to whoever holds the link.
export const inviteBody = z
  .strictObject({ email: z.string().trim().toLowerCase().pipe(z.email().max(254)).optional() })
  .default({});

// The token travels in the body, never the URL, so it stays out of access logs and browser history.
export const acceptBody = z.strictObject({ token: z.string().regex(/^[A-Za-z0-9_-]{20,128}$/, "Invalid invitation token") });

// Currency is deliberately absent: INR only for now, and strictObject rejects it if sent.
export const createHouseholdBody = z.strictObject({
  name: z.string().trim().min(1, "Required").max(80),
  timezone: z.string().refine(validTimezone, "Use an IANA timezone such as Asia/Kolkata").optional(),
  defaultSplitMethod: z.enum(["equal", "exact", "percentage", "weights"]).optional(),
});
