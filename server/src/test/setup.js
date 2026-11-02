import "dotenv/config";

// Point the app at the test database so tests can never touch dev data.
// Runs before any test file imports the app, and dotenv never overrides variables already set.
const testUrl = process.env.TEST_DATABASE_URL;
if (testUrl) {
  process.env.DATABASE_URL = testUrl;
  process.env.DIRECT_URL = testUrl;
}
