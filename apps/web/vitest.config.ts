import { defineConfig, mergeConfig } from "vitest/config";
import rootConfig from "../../vitest.config";

export default mergeConfig(rootConfig, defineConfig({
  test: {
    include: ["app/**/*.test.ts", "app/**/*.test.tsx", "src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "jsdom",
    coverage: {
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 60,
        statements: 60
      }
    }
  }
}));
