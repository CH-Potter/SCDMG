import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: [process.env.VITEST_SIM ? "sim/**/*.test.ts" : "tests/**/*.test.ts"] },
});
