import { defineConfig, mergeConfig } from "vitest/config";
import rootConfig from "../../vitest.config";

export default mergeConfig(rootConfig, defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      exclude: [
        "**/node_modules/**",
        "**/dist/**",
        "**/*.config.ts",
        "src/index.ts",
        "src/server.ts"
      ],
      thresholds: {
        lines: 80,
        functions: 70,
        branches: 80,
        statements: 80
      }
    }
  }
}));
