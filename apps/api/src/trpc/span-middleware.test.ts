import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { Hono } from "hono";
import { trpcServer } from "@hono/trpc-server";
import { createTrpcContext } from "./context";
import { router, publicProcedure } from "./router";

const logCalls: Array<Record<string, unknown>> = [];

vi.mock("@hone/observability", () => ({
  captureException: vi.fn(),
  createLogger: vi.fn((_name: string) => ({
    info: (...args: unknown[]) => {
      logCalls.push(args[0] as Record<string, unknown>);
    },
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  })),
  initSentry: vi.fn(),
  setSentryUser: vi.fn(),
  clearSentryUser: vi.fn()
}));

function buildApp(handler: () => unknown, viewerId?: string) {
  const testRouter = router({
    test: publicProcedure.query(handler)
  });
  const app = new Hono();
  app.use(
    "/trpc/*",
    trpcServer({
      router: testRouter,
      createContext: createTrpcContext(
        viewerId
          ? {
              auth: {
                getCurrentIdentity: async () => ({ userId: viewerId })
              }
            }
          : {}
      )
    })
  );
  return app;
}

function lastSpanLog(): Record<string, unknown> | undefined {
  return logCalls.findLast((c) => typeof c.span === "string");
}

describe("tRPC span middleware", () => {
  beforeEach(() => {
    logCalls.length = 0;
  });

  it("logs span name equal to procedure path", async () => {
    const app = buildApp(() => ({ ok: true }));
    await app.request("/trpc/test");
    const logged = lastSpanLog();
    expect(logged).toBeDefined();
    expect(logged!.span).toBe("test");
  });

  it("logs latency as a non-negative number", async () => {
    const app = buildApp(() => ({ ok: true }));
    await app.request("/trpc/test");
    const logged = lastSpanLog()!;
    expect(typeof logged.latency).toBe("number");
    expect(logged.latency as number).toBeGreaterThanOrEqual(0);
  });

  it("logs viewerId from authenticated identity", async () => {
    const uid = "00000000-0000-0000-0000-000000000001";
    const app = buildApp(() => ({ ok: true }), uid);
    await app.request("/trpc/test");
    const logged = lastSpanLog()!;
    expect(logged.viewerId).toBe(uid);
  });

  it("logs null viewerId when unauthenticated", async () => {
    const app = buildApp(() => ({ ok: true }));
    await app.request("/trpc/test");
    const logged = lastSpanLog()!;
    expect(logged.viewerId).toBeNull();
  });

  it("logs null errorType on success", async () => {
    const app = buildApp(() => ({ ok: true }));
    await app.request("/trpc/test");
    const logged = lastSpanLog()!;
    expect(logged.errorType).toBeNull();
  });

  it("logs errorType on TRPCError", async () => {
    const app = buildApp(() => {
      throw new TRPCError({ code: "NOT_FOUND", message: "missing" });
    });
    await app.request("/trpc/test");
    const logged = lastSpanLog()!;
    expect(logged.errorType).toBe("NOT_FOUND");
  });

  it("logs errorType INTERNAL_SERVER_ERROR on unexpected throw", async () => {
    const app = buildApp(() => {
      throw new Error("unexpected");
    });
    await app.request("/trpc/test");
    const logged = lastSpanLog()!;
    expect(logged.errorType).toBe("INTERNAL_SERVER_ERROR");
  });
});
