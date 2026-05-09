import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { MemoryCache, RedisCache } from "@hone/cache";
import type { Cache } from "@hone/cache";
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

const DOCKER_AVAILABLE = await (async () => {
  try {
    const { execSync } = await import("child_process");
    execSync("docker info", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

function buildCacheApp(cache: Cache) {
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

type DriverEntry = {
  driver: string;
  makeCache: () => Cache | Promise<Cache>;
};

const drivers: DriverEntry[] = [
  { driver: "memory", makeCache: () => new MemoryCache() },
];

let redisCache: RedisCache | undefined;
let redisTeardown: (() => Promise<void>) | undefined;

if (DOCKER_AVAILABLE) {
  beforeAll(async () => {
    const { GenericContainer } = await import("testcontainers");
    const { default: Redis } = await import("ioredis");

    const container = await new GenericContainer("redis:7-alpine")
      .withExposedPorts(6379)
      .start();

    const port = container.getMappedPort(6379);
    const client = new Redis({ host: "127.0.0.1", port, lazyConnect: true });
    await client.connect();

    redisCache = new RedisCache(client);
    redisTeardown = async () => {
      await client.quit();
      await container.stop();
    };

    drivers.push({ driver: "redis", makeCache: () => redisCache! });
  }, 60_000);

  afterAll(async () => {
    await redisTeardown?.();
  });
}

describe.each(drivers)("ctx.cache integration — $driver driver", ({ makeCache }) => {
  it("write then read returns the stored value", async () => {
    const cache = await makeCache();
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
    const cache = await makeCache();
    const app = buildCacheApp(cache);

    const res = await app.request("/trpc/cacheRead");
    expect(res.status).toBe(200);
  });
});

describe("ctx.cache is undefined when not provided", () => {
  it("cache is undefined in context when no cache dep given", async () => {
    const testRouter = router({
      checkCache: publicProcedure.query(async ({ ctx }) => {
        return { hasCache: ctx.cache !== undefined };
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
    expect(body.result.data.hasCache).toBe(false);
  });
});
