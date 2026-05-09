import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { RedisCache } from "./redis-adapter.js";

const DOCKER_AVAILABLE = await (async () => {
  try {
    const { execSync } = await import("child_process");
    execSync("docker info", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!DOCKER_AVAILABLE)("RedisCache (testcontainers)", () => {
  let cache: RedisCache;
  let stop: () => Promise<void>;

  beforeAll(async () => {
    const { GenericContainer } = await import("testcontainers");
    const { default: Redis } = await import("ioredis");

    const container = await new GenericContainer("redis:7-alpine")
      .withExposedPorts(6379)
      .start();

    const port = container.getMappedPort(6379);
    const client = new Redis({ host: "127.0.0.1", port, lazyConnect: true });
    await client.connect();

    cache = new RedisCache(client);
    stop = async () => {
      await client.quit();
      await container.stop();
    };
  }, 60_000);

  afterAll(async () => {
    await stop?.();
  });

  it("returns null for missing key", async () => {
    expect(await cache.get("missing")).toBeNull();
  });

  it("stores and retrieves a value", async () => {
    await cache.set("k", { hello: "world" }, 5_000);
    expect(await cache.get("k")).toEqual({ hello: "world" });
  });

  it("expires entries after TTL", async () => {
    await cache.set("short", "v", 100);
    await new Promise((r) => setTimeout(r, 200));
    expect(await cache.get("short")).toBeNull();
  });

  it("del removes a key", async () => {
    await cache.set("del-key", 42, 5_000);
    await cache.del("del-key");
    expect(await cache.get("del-key")).toBeNull();
  });

  it("mset / mget round-trip", async () => {
    await cache.mset([
      { key: "m1", value: "a", ttlMs: 5_000 },
      { key: "m2", value: "b", ttlMs: 5_000 },
    ]);
    expect(await cache.mget(["m1", "m2", "missing"])).toEqual(["a", "b", null]);
  });

  it("incr initialises and increments", async () => {
    const first = await cache.incr("ctr", 1, 5_000);
    const second = await cache.incr("ctr", 2, 5_000);
    expect(first).toBe(1);
    expect(second).toBe(3);
  });

  it("incr does not reset TTL on subsequent calls", async () => {
    const key = "ttl-ctr";
    await cache.incr(key, 1, 200);
    await new Promise((r) => setTimeout(r, 100));
    await cache.incr(key, 1, 200);
    await new Promise((r) => setTimeout(r, 150));
    expect(await cache.get<number>(key)).toBeNull();
  });
});
