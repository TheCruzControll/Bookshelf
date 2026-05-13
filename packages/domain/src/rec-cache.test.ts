import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_REC_CACHE_TTL_MS,
  getCachedRecs,
  invalidateRecCache,
  recCacheKey,
  setCachedRecs,
} from "./rec-cache";
import type { RecCachePort } from "./rec-cache";
import type { RecommendationInput } from "./schemas/recs";

// ---------------------------------------------------------------------------
// Fake cache — records every call and stores values in a Map.
// ---------------------------------------------------------------------------

interface SetCall {
  key: string;
  value: unknown;
  ttlMs: number;
}

class FakeCache implements RecCachePort {
  store = new Map<string, unknown>();
  setCalls: SetCall[] = [];
  delCalls: string[] = [];
  getCalls: string[] = [];

  async get<T>(key: string): Promise<T | null> {
    this.getCalls.push(key);
    if (!this.store.has(key)) return null;
    return this.store.get(key) as T;
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    this.setCalls.push({ key, value, ttlMs });
    this.store.set(key, value);
  }

  async del(key: string): Promise<void> {
    this.delCalls.push(key);
    this.store.delete(key);
  }
}

function makeRec(bookId: string, score = 5): RecommendationInput {
  return {
    book: {
      id: bookId,
      canonicalTitle: `Book ${bookId}`,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    },
    score,
    reason: "Recommended for you",
  };
}

const VIEWER = "user-123";

let cache: FakeCache;
beforeEach(() => {
  cache = new FakeCache();
});

// ---------------------------------------------------------------------------
// recCacheKey
// ---------------------------------------------------------------------------

describe("recCacheKey", () => {
  it("is namespaced by surface and user id", () => {
    expect(recCacheKey(VIEWER, "discover")).toBe("recs:discover:user-123");
    expect(recCacheKey(VIEWER, "book_detail")).toBe("recs:book_detail:user-123");
  });

  it("returns distinct keys per surface for the same viewer", () => {
    expect(recCacheKey(VIEWER, "discover")).not.toBe(recCacheKey(VIEWER, "book_detail"));
  });

  it("returns distinct keys per viewer for the same surface", () => {
    expect(recCacheKey("a", "discover")).not.toBe(recCacheKey("b", "discover"));
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_REC_CACHE_TTL_MS
// ---------------------------------------------------------------------------

describe("DEFAULT_REC_CACHE_TTL_MS", () => {
  it("is 5 minutes", () => {
    expect(DEFAULT_REC_CACHE_TTL_MS).toBe(5 * 60 * 1000);
  });
});

// ---------------------------------------------------------------------------
// setCachedRecs / getCachedRecs
// ---------------------------------------------------------------------------

describe("setCachedRecs / getCachedRecs", () => {
  it("round-trips a rec list under the (user, surface) key", async () => {
    const recs = [makeRec("b1"), makeRec("b2")];
    await setCachedRecs(cache, VIEWER, "discover", recs);

    const fetched = await getCachedRecs(cache, VIEWER, "discover");
    expect(fetched).toEqual(recs);
    expect(cache.setCalls).toEqual([
      { key: "recs:discover:user-123", value: recs, ttlMs: DEFAULT_REC_CACHE_TTL_MS },
    ]);
  });

  it("uses the configurable TTL when supplied", async () => {
    await setCachedRecs(cache, VIEWER, "discover", [], 60_000);
    expect(cache.setCalls[0]?.ttlMs).toBe(60_000);
  });

  it("rejects non-positive or non-finite TTL values", async () => {
    await expect(setCachedRecs(cache, VIEWER, "discover", [], 0)).rejects.toThrow(
      /ttlMs must be a positive number/,
    );
    await expect(setCachedRecs(cache, VIEWER, "discover", [], -1)).rejects.toThrow(
      /ttlMs must be a positive number/,
    );
    await expect(
      setCachedRecs(cache, VIEWER, "discover", [], Number.NaN),
    ).rejects.toThrow(/ttlMs must be a positive number/);
    await expect(
      setCachedRecs(cache, VIEWER, "discover", [], Number.POSITIVE_INFINITY),
    ).rejects.toThrow(/ttlMs must be a positive number/);
  });

  it("stores distinct entries per surface for the same viewer", async () => {
    const discover = [makeRec("d1")];
    const detail = [makeRec("x1")];
    await setCachedRecs(cache, VIEWER, "discover", discover);
    await setCachedRecs(cache, VIEWER, "book_detail", detail);

    expect(await getCachedRecs(cache, VIEWER, "discover")).toEqual(discover);
    expect(await getCachedRecs(cache, VIEWER, "book_detail")).toEqual(detail);
  });

  it("returns null on a cold key", async () => {
    expect(await getCachedRecs(cache, VIEWER, "discover")).toBeNull();
  });

  it("treats null/undefined cache as a no-op (miss on read, no throw on write)", async () => {
    await expect(setCachedRecs(null, VIEWER, "discover", [makeRec("b1")])).resolves.toBeUndefined();
    await expect(setCachedRecs(undefined, VIEWER, "discover", [makeRec("b1")])).resolves.toBeUndefined();
    expect(await getCachedRecs(null, VIEWER, "discover")).toBeNull();
    expect(await getCachedRecs(undefined, VIEWER, "discover")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// invalidateRecCache
// ---------------------------------------------------------------------------

describe("invalidateRecCache", () => {
  it("deletes the single-surface key when surface is provided", async () => {
    await setCachedRecs(cache, VIEWER, "discover", [makeRec("b1")]);
    await setCachedRecs(cache, VIEWER, "book_detail", [makeRec("b2")]);

    await invalidateRecCache(cache, VIEWER, "discover");

    expect(cache.delCalls).toEqual(["recs:discover:user-123"]);
    expect(await getCachedRecs(cache, VIEWER, "discover")).toBeNull();
    expect(await getCachedRecs(cache, VIEWER, "book_detail")).not.toBeNull();
  });

  it("deletes all known surfaces for the viewer when surface is omitted", async () => {
    await setCachedRecs(cache, VIEWER, "discover", [makeRec("b1")]);
    await setCachedRecs(cache, VIEWER, "book_detail", [makeRec("b2")]);

    await invalidateRecCache(cache, VIEWER);

    expect(new Set(cache.delCalls)).toEqual(
      new Set(["recs:discover:user-123", "recs:book_detail:user-123"]),
    );
    expect(await getCachedRecs(cache, VIEWER, "discover")).toBeNull();
    expect(await getCachedRecs(cache, VIEWER, "book_detail")).toBeNull();
  });

  it("is a no-op when no cache is configured", async () => {
    await expect(invalidateRecCache(null, VIEWER)).resolves.toBeUndefined();
    await expect(invalidateRecCache(undefined, VIEWER, "discover")).resolves.toBeUndefined();
  });
});
