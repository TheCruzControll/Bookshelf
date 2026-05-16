import { describe, it, expect, vi, beforeEach } from "vitest";
import { CatalogService } from "./catalog-service.js";
import type { CatalogProvider, BookSearchResult } from "@hone/domain";
import type { Cache } from "@hone/cache";

function makeResult(overrides: Partial<BookSearchResult> = {}): BookSearchResult {
  return {
    source: "open_library",
    sourceKey: "/works/OL1W",
    title: "Test Book",
    authors: ["Author One"],
    ...overrides,
  };
}

function makeOLResult(overrides: Partial<BookSearchResult> = {}): BookSearchResult {
  return makeResult({ source: "open_library", sourceKey: "/works/OL1W", ...overrides });
}

function makeGBResult(overrides: Partial<BookSearchResult> = {}): BookSearchResult {
  return makeResult({ source: "google_books", sourceKey: "vol_1", ...overrides });
}

function makeMockProvider(overrides: Partial<CatalogProvider> = {}): CatalogProvider {
  return {
    search: vi.fn().mockResolvedValue([]),
    lookupByIsbn: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

function makeMockCache(): Cache & {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
  mget: ReturnType<typeof vi.fn>;
  mset: ReturnType<typeof vi.fn>;
  incr: ReturnType<typeof vi.fn>;
} {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    del: vi.fn().mockResolvedValue(undefined),
    mget: vi.fn().mockResolvedValue([]),
    mset: vi.fn().mockResolvedValue(undefined),
    incr: vi.fn().mockResolvedValue(0),
  };
}

describe("CatalogService", () => {
  let ol: CatalogProvider;
  let gb: CatalogProvider;
  let cache: ReturnType<typeof makeMockCache>;
  let service: CatalogService;

  beforeEach(() => {
    ol = makeMockProvider();
    gb = makeMockProvider();
    cache = makeMockCache();
    service = new CatalogService(ol, gb, cache);
  });

  describe("search", () => {
    it("composes OL + GB via the port — returns OL results when OL has hits", async () => {
      const olResults = [makeOLResult({ title: "The Great Gatsby" })];
      (ol.search as ReturnType<typeof vi.fn>).mockResolvedValue(olResults);

      const results = await service.search("gatsby", 10);

      expect(results).toEqual(olResults);
      expect(ol.search).toHaveBeenCalledWith("gatsby", 10);
      expect(gb.search).not.toHaveBeenCalled();
    });

    it("on OL miss (zero results) falls back to GB call", async () => {
      (ol.search as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      const gbResults = [makeGBResult({ title: "The Great Gatsby" })];
      (gb.search as ReturnType<typeof vi.fn>).mockResolvedValue(gbResults);

      const results = await service.search("gatsby", 10);

      expect(results).toEqual(gbResults);
      expect(ol.search).toHaveBeenCalledWith("gatsby", 10);
      expect(gb.search).toHaveBeenCalledWith("gatsby", 10);
    });

    it("returns empty array when both OL and GB return zero results", async () => {
      (ol.search as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (gb.search as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const results = await service.search("nonexistent xyz123", 10);

      expect(results).toEqual([]);
      expect(ol.search).toHaveBeenCalled();
      expect(gb.search).toHaveBeenCalled();
    });

    it("caches OL results for subsequent identical search", async () => {
      const olResults = [makeOLResult({ title: "Cached Book" })];
      (ol.search as ReturnType<typeof vi.fn>).mockResolvedValue(olResults);

      await service.search("cached query", 10);

      expect(cache.set).toHaveBeenCalledWith(
        "catalog:search:cached query:10:",
        olResults,
        expect.any(Number)
      );
    });

    it("caches GB results when they are the fallback result", async () => {
      (ol.search as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      const gbResults = [makeGBResult({ title: "GB Cached" })];
      (gb.search as ReturnType<typeof vi.fn>).mockResolvedValue(gbResults);

      await service.search("gb query", 10);

      expect(cache.set).toHaveBeenCalledWith(
        "catalog:search:gb query:10:",
        gbResults,
        expect.any(Number)
      );
    });

    it("does not cache when both sources return empty", async () => {
      (ol.search as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (gb.search as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await service.search("nothing", 10);

      expect(cache.set).not.toHaveBeenCalled();
    });

    it("subsequent identical search hits cache — no provider calls", async () => {
      const cachedResults = [makeOLResult({ title: "Cached" })];
      cache.get.mockResolvedValue(cachedResults);

      const results = await service.search("cached", 10);

      expect(results).toEqual(cachedResults);
      expect(ol.search).not.toHaveBeenCalled();
      expect(gb.search).not.toHaveBeenCalled();
    });

    it("normalizes cache key to lowercase and trimmed", async () => {
      (ol.search as ReturnType<typeof vi.fn>).mockResolvedValue([makeOLResult()]);

      await service.search("  Gatsby  ", 10);

      expect(cache.get).toHaveBeenCalledWith("catalog:search:gatsby:10:");
      expect(cache.set).toHaveBeenCalledWith(
        "catalog:search:gatsby:10:",
        expect.any(Array),
        expect.any(Number)
      );
    });

    it("different limits produce different cache keys", async () => {
      (ol.search as ReturnType<typeof vi.fn>).mockResolvedValue([makeOLResult()]);

      await service.search("gatsby", 5);
      await service.search("gatsby", 10);

      expect(cache.get).toHaveBeenCalledWith("catalog:search:gatsby:5:");
      expect(cache.get).toHaveBeenCalledWith("catalog:search:gatsby:10:");
    });

    it("different viewer locales produce different cache keys", async () => {
      (ol.search as ReturnType<typeof vi.fn>).mockResolvedValue([makeOLResult()]);

      await service.search("gatsby", 10, "en-US");
      await service.search("gatsby", 10, "fr-FR");

      expect(cache.get).toHaveBeenCalledWith("catalog:search:gatsby:10:en-us");
      expect(cache.get).toHaveBeenCalledWith("catalog:search:gatsby:10:fr-fr");
    });
  });

  describe("lookupByIsbn", () => {
    it("returns OL result when OL has a match", async () => {
      const olResult = makeOLResult({ isbn13: "9780743273565" });
      (ol.lookupByIsbn as ReturnType<typeof vi.fn>).mockResolvedValue(olResult);

      const result = await service.lookupByIsbn("9780743273565");

      expect(result).toEqual(olResult);
      expect(ol.lookupByIsbn).toHaveBeenCalledWith("9780743273565");
      expect(gb.lookupByIsbn).not.toHaveBeenCalled();
    });

    it("on OL miss (null) falls back to GB lookup", async () => {
      (ol.lookupByIsbn as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const gbResult = makeGBResult({ isbn13: "9780743273565" });
      (gb.lookupByIsbn as ReturnType<typeof vi.fn>).mockResolvedValue(gbResult);

      const result = await service.lookupByIsbn("9780743273565");

      expect(result).toEqual(gbResult);
      expect(ol.lookupByIsbn).toHaveBeenCalledWith("9780743273565");
      expect(gb.lookupByIsbn).toHaveBeenCalledWith("9780743273565");
    });

    it("returns null when both OL and GB miss", async () => {
      (ol.lookupByIsbn as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (gb.lookupByIsbn as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await service.lookupByIsbn("0000000000");

      expect(result).toBeNull();
      expect(ol.lookupByIsbn).toHaveBeenCalled();
      expect(gb.lookupByIsbn).toHaveBeenCalled();
    });

    it("caches OL lookup result", async () => {
      const olResult = makeOLResult({ isbn13: "9780743273565" });
      (ol.lookupByIsbn as ReturnType<typeof vi.fn>).mockResolvedValue(olResult);

      await service.lookupByIsbn("9780743273565");

      expect(cache.set).toHaveBeenCalledWith(
        "catalog:isbn:9780743273565",
        olResult,
        expect.any(Number)
      );
    });

    it("caches GB lookup result on OL miss", async () => {
      (ol.lookupByIsbn as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const gbResult = makeGBResult({ isbn13: "9780743273565" });
      (gb.lookupByIsbn as ReturnType<typeof vi.fn>).mockResolvedValue(gbResult);

      await service.lookupByIsbn("9780743273565");

      expect(cache.set).toHaveBeenCalledWith(
        "catalog:isbn:9780743273565",
        gbResult,
        expect.any(Number)
      );
    });

    it("does not cache when both sources return null", async () => {
      (ol.lookupByIsbn as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (gb.lookupByIsbn as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await service.lookupByIsbn("0000000000");

      expect(cache.set).not.toHaveBeenCalled();
    });

    it("subsequent identical ISBN lookup hits cache", async () => {
      const cachedResult = makeOLResult({ isbn13: "9780743273565" });
      cache.get.mockResolvedValue(cachedResult);

      const result = await service.lookupByIsbn("9780743273565");

      expect(result).toEqual(cachedResult);
      expect(ol.lookupByIsbn).not.toHaveBeenCalled();
      expect(gb.lookupByIsbn).not.toHaveBeenCalled();
    });

    it("strips hyphens and spaces from ISBN for cache key", async () => {
      (ol.lookupByIsbn as ReturnType<typeof vi.fn>).mockResolvedValue(makeOLResult());

      await service.lookupByIsbn("978-0-7432-7356-5");

      expect(cache.get).toHaveBeenCalledWith("catalog:isbn:9780743273565");
    });
  });

  describe("without cache", () => {
    it("search works without cache (cache is optional)", async () => {
      const serviceNoCache = new CatalogService(ol, gb);
      const olResults = [makeOLResult({ title: "No Cache Book" })];
      (ol.search as ReturnType<typeof vi.fn>).mockResolvedValue(olResults);

      const results = await serviceNoCache.search("test", 10);

      expect(results).toEqual(olResults);
    });

    it("lookupByIsbn works without cache (cache is optional)", async () => {
      const serviceNoCache = new CatalogService(ol, gb);
      const olResult = makeOLResult();
      (ol.lookupByIsbn as ReturnType<typeof vi.fn>).mockResolvedValue(olResult);

      const result = await serviceNoCache.lookupByIsbn("9780743273565");

      expect(result).toEqual(olResult);
    });

    it("fallback still works without cache", async () => {
      const serviceNoCache = new CatalogService(ol, gb);
      (ol.search as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      const gbResults = [makeGBResult({ title: "GB Fallback" })];
      (gb.search as ReturnType<typeof vi.fn>).mockResolvedValue(gbResults);

      const results = await serviceNoCache.search("test", 10);

      expect(results).toEqual(gbResults);
    });
  });
});
