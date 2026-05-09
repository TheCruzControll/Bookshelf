import { defineConfig, mergeConfig } from "vitest/config";
import rootConfig from "../../vitest.config";

export default mergeConfig(rootConfig, defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90
      }
    }
  }
}));
