import { describe, it, expect } from "vitest";
import { createLogger } from "./logger.js";

describe("createLogger", () => {
  it("returns a pino logger with the given name", () => {
    const logger = createLogger("test-service");
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.debug).toBe("function");
  });

  it("sets the logger name correctly", () => {
    const logger = createLogger("my-service");
    expect((logger.bindings() as Record<string, unknown>)["name"]).toBe("my-service");
  });

  it("creates distinct loggers for distinct names", () => {
    const a = createLogger("service-a");
    const b = createLogger("service-b");
    expect((a.bindings() as Record<string, unknown>)["name"]).toBe("service-a");
    expect((b.bindings() as Record<string, unknown>)["name"]).toBe("service-b");
  });
});
