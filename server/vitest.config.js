import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./src/test/setup.js"],
    // Database tests share one test database, so test files must run one at a time.
    fileParallelism: false,
  },
});
