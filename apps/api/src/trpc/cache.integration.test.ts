import { describe, it, expect, vi } from "vitest";
import { MemoryCache } from "@hone/cache";
import { router, publicProcedure } from "./router";
import { Hono } from "hono";
import { trpcServer } from "@hono/trpc-server";
import { createTrpcContext } from "./context";

vi.mock("@hone/observability", () => ({
  captureException: vi.fn(),
  createLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn() })),
  initSentry: vi.fn(),
  setSentryUser: vi.fn(),
  clearSentryUser: vi.fn(),
}));

function buildCacheApp(cache: MemoryCache) {
  const testRouter = router({
    cacheWrite: publicProcedure
      .query(async ({ ctx }) => {
        await ctx.cache?.set("test-key", { hello: "world" }, 60_000);
        return { ok: true };
      }),
    cacheRead: publicProcedure
      .query(async ({ ctx }) => {
        const value = await ctx.cache?.get<{ hello: string }>("test-key");
        return { value };
      }),
  });

  const app = new Hono();
  app.use(
    "/trpc/*",
    trpcServer({
      router: testRouter,
      createContext: createTrpcContext({ cache }),
    })
  );
  return app;
}

describe.each([
  { driver: "memory", makeCache: () => new MemoryCache() },
] as const)("ctx.cache integration — $driver driver", ({ makeCache }) => {
  it("write then read returns the stored value", async () => {
    const cache = makeCache();
    const app = buildCacheApp(cache);

    const writeRes = await app.request("/trpc/cacheWrite");
    expect(writeRes.status).toBe(200);
    const writeBody = await writeRes.json();
    expect(writeBody.result.data).toMatchObject({ ok: true });

    const readRes = await app.request("/trpc/cacheRead");
    expect(readRes.status).toBe(200);
    const readBody = await readRes.json();
    expect(readBody.result.data.value).toMatchObject({ hello: "world" });
  });

  it("ctx.cache is defined when cache dep is provided", async () => {
    const cache = makeCache();
    const app = buildCacheApp(cache);

    const res = await app.request("/trpc/cacheRead");
    expect(res.status).toBe(200);
  });
});

describe("ctx.cache is undefined when not provided", () => {
  it("cache is undefined in context when no cache dep given", async () => {
    const testRouter = router({
      checkCache: publicProcedure.query(async ({ ctx }) => {
        return { hasCach: ctx.cache !== undefined };
      }),
    });

    const app = new Hono();
    app.use(
      "/trpc/*",
      trpcServer({
        router: testRouter,
        createContext: createTrpcContext({}),
      })
    );

    const res = await app.request("/trpc/checkCache");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.hasCach).toBe(false);
  });
});
