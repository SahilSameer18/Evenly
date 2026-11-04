import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ quiet: true });

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  DATABASE_URL: z.string().min(1, "Required (pooled Postgres connection string)"),
  DIRECT_URL: z.string().min(1, "Required (direct Postgres connection string, for migrations)"),
  CLIENT_ORIGIN: z.url().default("http://localhost:5173"),
  // How many proxies sit in front of the app in production (Render alone is 1; Vercel forwarding to Render is 2).
  // Too low and everyone looks like the same IP (one shared rate limit); too high and a client could fake its IP.
  // A blank value (an empty box in a dashboard) counts as "not set", not as 0.
  TRUST_PROXY: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().int().min(0).max(5).default(1)),
  JWT_ACCESS_SECRET: z.string().min(32, "Required (at least 32 random characters, signs access tokens)"),
});

export function parseEnv(source) {
  const result = schema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

let env;
try {
  env = parseEnv(process.env);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

export default env;
