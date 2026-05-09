import { defineConfig, mergeConfig } from "vitest/config";
import rootConfig from "../../vitest.config";

export default mergeConfig(rootConfig, defineConfig({
  test: {
    include: ["app/**/*.test.ts", "app/**/*.test.tsx", "src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "jsdom",
    passWithNoTests: true
  }
}));
