import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { MemoryCache } from "./memory-adapter.js";

describe("MemoryCache", () => {
  let cache: MemoryCache;

  beforeEach(() => {
    cache = new MemoryCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("get / set", () => {
    it("returns null for missing key", async () => {
      expect(await cache.get("missing")).toBeNull();
    });

    it("stores and retrieves a value", async () => {
      await cache.set("k", { foo: 1 }, 5000);
      expect(await cache.get("k")).toEqual({ foo: 1 });
    });

    it("returns null after TTL expires", async () => {
      await cache.set("k", "v", 1000);
      vi.advanceTimersByTime(1001);
      expect(await cache.get("k")).toBeNull();
    });

    it("overwrites existing key", async () => {
      await cache.set("k", "first", 5000);
      await cache.set("k", "second", 5000);
      expect(await cache.get("k")).toBe("second");
    });
  });

  describe("del", () => {
    it("removes a key", async () => {
      await cache.set("k", "v", 5000);
      await cache.del("k");
      expect(await cache.get("k")).toBeNull();
    });

    it("is a no-op for missing key", async () => {
      await expect(cache.del("nonexistent")).resolves.toBeUndefined();
    });
  });

  describe("mget / mset", () => {
    it("mget returns nulls for all missing keys", async () => {
      expect(await cache.mget(["a", "b"])).toEqual([null, null]);
    });

    it("mset stores multiple entries; mget retrieves them", async () => {
      await cache.mset([
        { key: "a", value: 1, ttlMs: 5000 },
        { key: "b", value: 2, ttlMs: 5000 },
      ]);
      expect(await cache.mget(["a", "b"])).toEqual([1, 2]);
    });

    it("mget returns null for expired entries", async () => {
      await cache.mset([
        { key: "a", value: 1, ttlMs: 500 },
        { key: "b", value: 2, ttlMs: 5000 },
      ]);
      vi.advanceTimersByTime(600);
      expect(await cache.mget(["a", "b"])).toEqual([null, 2]);
    });
  });

  describe("incr", () => {
    it("initialises counter at `by` when key is absent", async () => {
      expect(await cache.incr("counter", 1, 5000)).toBe(1);
    });

    it("increments an existing counter", async () => {
      await cache.incr("counter", 1, 5000);
      await cache.incr("counter", 1, 5000);
      expect(await cache.incr("counter", 3, 5000)).toBe(5);
    });

    it("sets TTL on first incr; subsequent incrs preserve expiry", async () => {
      await cache.incr("counter", 1, 1000);
      vi.advanceTimersByTime(1001);
      expect(await cache.get<number>("counter")).toBeNull();
    });
  });
});
