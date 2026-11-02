import "dotenv/config";

// Tests sign their own tokens, so they get a fixed secret unless .env provides one.
process.env.JWT_ACCESS_SECRET ??= "test-only-secret-test-only-secret-1234";

// Point the app at the test database so tests can never touch dev data.
// Runs before any test file imports the app, and dotenv never overrides variables already set.
const testUrl = process.env.TEST_DATABASE_URL;
if (testUrl) {
  // Remember the dev URLs so db-helper can refuse to wipe them.
  process.env.DEV_DATABASE_URL = process.env.DATABASE_URL ?? "";
  process.env.DEV_DIRECT_URL = process.env.DIRECT_URL ?? "";
  process.env.DATABASE_URL = testUrl;
  process.env.DIRECT_URL = testUrl;
}
