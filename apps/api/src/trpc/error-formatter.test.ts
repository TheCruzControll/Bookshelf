import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

vi.mock("@hone/observability", () => ({
  captureException: vi.fn(),
  createLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn() })),
  initSentry: vi.fn(),
  setSentryUser: vi.fn(),
  clearSentryUser: vi.fn()
}));

describe("tRPC error formatter — HTTP transport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function buildApp(handler: () => unknown) {
    const { router, publicProcedure } = await import("./router");
    const { createApi } = await import("../app");
    const testRouter = router({
      test: publicProcedure.query(handler)
    });
    const { Hono } = await import("hono");
    const { trpcServer } = await import("@hono/trpc-server");
    const { createTrpcContext } = await import("./context");
    const app = new Hono();
    app.use(
      "/trpc/*",
      trpcServer({ router: testRouter, createContext: createTrpcContext({}) })
    );
    return app;
  }

  it("formats ZodError — message contains field path", async () => {
    const { router, publicProcedure } = await import("./router");
    const inputSchema = z.object({ name: z.string().min(3) });
    const testRouter = router({
      test: publicProcedure
        .input(inputSchema)
        .query(({ input }) => input)
    });
    const { Hono } = await import("hono");
    const { trpcServer } = await import("@hono/trpc-server");
    const { createTrpcContext } = await import("./context");
    const app = new Hono();
    app.use(
      "/trpc/*",
      trpcServer({ router: testRouter, createContext: createTrpcContext({}) })
    );

    const res = await app.request(
      "/trpc/test?input=" + encodeURIComponent(JSON.stringify({ name: "ab" }))
    );
    const body = await res.json();
    expect(body.error.message).toMatch(/name:/);
  });

  it("INTERNAL_SERVER_ERROR — message is sanitized to safe string", async () => {
    const app = await buildApp(() => {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "secret db password in message"
      });
    });

    const res = await app.request("/trpc/test");
    const body = await res.json();
    expect(body.error.message).toBe("Internal server error");
  });

  it("INTERNAL_SERVER_ERROR — stack is not present in response", async () => {
    const app = await buildApp(() => {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "boom" });
    });

    const res = await app.request("/trpc/test");
    const body = await res.json();
    expect(body.error.data?.stack).toBeUndefined();
  });

  it("INTERNAL_SERVER_ERROR — captures cause via Sentry", async () => {
    const { captureException } = await import("@hone/observability");
    const originalError = new Error("original cause");
    const app = await buildApp(() => {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        cause: originalError
      });
    });

    await app.request("/trpc/test");
    expect(captureException).toHaveBeenCalledWith(originalError);
  });

  it("INTERNAL_SERVER_ERROR without cause — captures TRPCError via Sentry", async () => {
    const { captureException } = await import("@hone/observability");
    const app = await buildApp(() => {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "boom" });
    });

    await app.request("/trpc/test");
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it("NOT_FOUND — does not capture with Sentry", async () => {
    const { captureException } = await import("@hone/observability");
    const app = await buildApp(() => {
      throw new TRPCError({ code: "NOT_FOUND", message: "not found" });
    });

    await app.request("/trpc/test");
    expect(captureException).not.toHaveBeenCalled();
  });

  it("client errors — no stack trace in response data", async () => {
    const app = await buildApp(() => {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "denied" });
    });

    const res = await app.request("/trpc/test");
    const body = await res.json();
    expect(body.error.data?.stack).toBeUndefined();
  });
});
