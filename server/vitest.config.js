import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./src/test/setup.js"],
    // Database tests share one test database and wipe it between tests, so test files must run one at a time.
    // fileParallelism alone was not enough: runs were flaky until the worker count was also pinned to 1.
    fileParallelism: false,
    maxWorkers: 1,
  },
});
