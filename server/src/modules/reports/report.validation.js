import { z } from "zod";

// "YYYY-MM", month 01 to 12. Left out means the current month in the household's timezone.
export const monthlyQuery = z.strictObject({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use the form YYYY-MM").optional(),
});
