import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Runs once per run, before any test: takes the lock that stops two runs sharing the test database.
    globalSetup: ["./src/test/globalSetup.js"],
    setupFiles: ["./src/test/setup.js"],
    // Database tests share one test database and wipe it between tests, so test files must run one at a time.
    // fileParallelism alone was not enough: runs were flaky until the worker count was also pinned to 1.
    fileParallelism: false,
    maxWorkers: 1,
    // The test database is a remote Neon branch, so a test that makes several requests can pass 5 seconds.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
