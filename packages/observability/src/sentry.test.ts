import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SentryEnv } from "./sentry.js";

vi.mock("@sentry/node", () => ({
  init: vi.fn(),
}));

describe("initSentry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls Sentry.init with dsn and environment", async () => {
    const { initSentry } = await import("./sentry.js");
    const { init } = await import("@sentry/node");

    const env: SentryEnv = {
      SENTRY_DSN: "https://abc@sentry.example.com/1",
      SENTRY_ENVIRONMENT: "production",
    };

    initSentry(env);

    expect(init).toHaveBeenCalledOnce();
    expect(init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: "https://abc@sentry.example.com/1",
        environment: "production",
      })
    );
  });

  it("uses lower tracesSampleRate in production", async () => {
    const { initSentry } = await import("./sentry.js");
    const { init } = await import("@sentry/node");

    const env: SentryEnv = {
      SENTRY_DSN: "https://abc@sentry.example.com/1",
      SENTRY_ENVIRONMENT: "production",
    };

    initSentry(env);

    expect(init).toHaveBeenCalledWith(
      expect.objectContaining({ tracesSampleRate: 0.2 })
    );
  });

  it("uses full tracesSampleRate in non-production environments", async () => {
    const { initSentry } = await import("./sentry.js");
    const { init } = await import("@sentry/node");

    const env: SentryEnv = {
      SENTRY_DSN: "https://abc@sentry.example.com/1",
      SENTRY_ENVIRONMENT: "development",
    };

    initSentry(env);

    expect(init).toHaveBeenCalledWith(
      expect.objectContaining({ tracesSampleRate: 1.0 })
    );
  });

  it("works with staging environment", async () => {
    const { initSentry } = await import("./sentry.js");
    const { init } = await import("@sentry/node");

    const env: SentryEnv = {
      SENTRY_DSN: "https://abc@sentry.example.com/1",
      SENTRY_ENVIRONMENT: "staging",
    };

    initSentry(env);

    expect(init).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: "staging",
        tracesSampleRate: 1.0,
      })
    );
  });
});
