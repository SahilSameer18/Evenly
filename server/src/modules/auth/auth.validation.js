import { z } from "zod";

export const registerBody = z.strictObject({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  password: z.string().min(8, "Use at least 8 characters").max(128, "Use at most 128 characters"),
  name: z.string().trim().min(1, "Required").max(80),
});

// No minimum length here: login must not reveal the password rules. The max stops huge payloads being hashed.
export const loginBody = z.strictObject({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  password: z.string().min(1, "Required").max(128),
});
