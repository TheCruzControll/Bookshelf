import { defineConfig, mergeConfig } from "vitest/config";
import rootConfig from "../../vitest.config";

export default mergeConfig(rootConfig, defineConfig({
  // Use the automatic JSX runtime (matches Next.js' production behaviour)
  // so component sources do not need to import `React` explicitly.
  esbuild: {
    jsx: "automatic",
  },
  test: {
    include: ["app/**/*.test.ts", "app/**/*.test.tsx", "*.test.ts"],
    passWithNoTests: true,
    coverage: {
      include: ["app/**/*.ts", "app/**/*.tsx"],
      thresholds: {
        // TODO(coverage): raise to 60 per docs/testing-strategy.md once unit-testable logic exists in app/
        lines: 0,
        functions: 0,
        branches: 0,
        statements: 0
      }
    }
  }
}));
