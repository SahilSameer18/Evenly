import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ quiet: true });

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  DATABASE_URL: z.string().min(1, "Required (pooled Postgres connection string)"),
  DIRECT_URL: z.string().min(1, "Required (direct Postgres connection string, for migrations)"),
  CLIENT_ORIGIN: z.url().default("http://localhost:5173"),
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
