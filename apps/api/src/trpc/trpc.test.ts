import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

const mockInfo = vi.fn();

vi.mock("@hone/observability", () => ({
  captureException: vi.fn(),
  createLogger: vi.fn(() => ({ info: mockInfo, error: vi.fn() })),
  initSentry: vi.fn(),
  setSentryUser: vi.fn(),
  clearSentryUser: vi.fn()
}));

async function buildApp(
  handler: () => unknown,
  identity: { userId: string } | null = null
) {
  const { router, publicProcedure } = await import("./router");
  const testRouter = router({
    myProcedure: publicProcedure.query(handler)
  });
  const { Hono } = await import("hono");
  const { trpcServer } = await import("@hono/trpc-server");
  const { createTrpcContext } = await import("./context");
  const deps = {
    auth: identity
      ? { getCurrentIdentity: async () => identity }
      : { getCurrentIdentity: async () => null }
  };
  const app = new Hono();
  app.use(
    "/trpc/*",
    trpcServer({ router: testRouter, createContext: createTrpcContext(deps) })
  );
  return app;
}

function getLastLogCall(): Record<string, unknown> {
  const call = mockInfo.mock.calls[mockInfo.mock.calls.length - 1];
  if (!call || call.length === 0) throw new Error("no log calls recorded");
  return call[0] as Record<string, unknown>;
}

describe("tRPC tracing middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs span name equal to the procedure path", async () => {
    const app = await buildApp(() => "ok");
    await app.request("/trpc/myProcedure");
    expect(mockInfo).toHaveBeenCalledTimes(1);
    const logged = getLastLogCall();
    expect(logged.span).toBe("myProcedure");
  });

  it("logs viewer id when authenticated", async () => {
    const app = await buildApp(() => "ok", { userId: "user-abc-123" });
    await app.request("/trpc/myProcedure");
    const logged = getLastLogCall();
    expect(logged.viewerId).toBe("user-abc-123");
  });

  it("logs null viewer id when unauthenticated", async () => {
    const app = await buildApp(() => "ok", null);
    await app.request("/trpc/myProcedure");
    const logged = getLastLogCall();
    expect(logged.viewerId).toBeNull();
  });

  it("logs latency as a number", async () => {
    const app = await buildApp(() => "ok");
    await app.request("/trpc/myProcedure");
    const logged = getLastLogCall();
    expect(typeof logged.latency).toBe("number");
    expect(logged.latency as number).toBeGreaterThanOrEqual(0);
  });

  it("logs null error type on success", async () => {
    const app = await buildApp(() => "ok");
    await app.request("/trpc/myProcedure");
    const logged = getLastLogCall();
    expect(logged.errorType).toBeNull();
  });

  it("logs error type on TRPCError", async () => {
    const app = await buildApp(() => {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "denied" });
    });
    await app.request("/trpc/myProcedure");
    const logged = getLastLogCall();
    expect(logged.errorType).toBe("UNAUTHORIZED");
  });

  it("logs INTERNAL_SERVER_ERROR type for non-TRPCError throws", async () => {
    const app = await buildApp(() => {
      throw new Error("unexpected");
    });
    await app.request("/trpc/myProcedure");
    const logged = getLastLogCall();
    expect(logged.errorType).toBe("INTERNAL_SERVER_ERROR");
  });

  it("always logs even when procedure throws", async () => {
    const app = await buildApp(() => {
      throw new TRPCError({ code: "NOT_FOUND" });
    });
    await app.request("/trpc/myProcedure");
    expect(mockInfo).toHaveBeenCalledTimes(1);
  });
});
