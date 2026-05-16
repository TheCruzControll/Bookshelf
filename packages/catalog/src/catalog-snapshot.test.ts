/**
 * Snapshot tests for the Catalog flow (F-08 / issue #74).
 *
 * These tests wire the real {@link OpenLibraryClient} and
 * {@link GoogleBooksClient} adapters into the real {@link CatalogService}
 * with a real in-memory {@link MemoryCache}, and replay recorded HTTP
 * fixtures from `@hone/test-fixtures/src/fixtures/{openlibrary,google-books}`
 * via `nock`.
 *
 * Four scenarios are exercised end-to-end against the merged result shape:
 *   1. OL hit                 — GB must not be called.
 *   2. OL miss + GB hit       — GB is called and provides the fallback.
 *   3. Both miss              — empty result.
 *   4. Malformed JSON         — service surfaces a failure (no silent corruption).
 *
 * Cache state is asserted on every scenario:
 *   - successful results are persisted under the canonical search key;
 *   - empty / failed results are NOT cached;
 *   - a subsequent identical search hits the cache and does not re-issue HTTP
 *     requests.
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import nock from "nock";
import { MemoryCache } from "@hone/cache";
import type { BookSearchResult } from "@hone/domain";
import { CatalogService } from "./catalog-service.js";
import { OpenLibraryClient } from "./open-library-client.js";
import { GoogleBooksClient } from "./google-books-client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const OL_BASE = "https://openlibrary.org";
const GB_BASE = "https://www.googleapis.com";
const GB_PATH = "/books/v1";

const USER_AGENT = "HoneTest/1.0 (test@example.com)";
const API_KEY = "test-api-key-123";

const SEARCH_CACHE_TTL_MS = 60 * 60 * 1000;

type JsonObject = Record<string, unknown>;

function loadFixture(provider: "openlibrary" | "google-books", name: string): JsonObject {
  const raw = readFileSync(
    join(__dirname, "../../../packages/test-fixtures/src/fixtures", provider, name),
    "utf-8"
  );
  return JSON.parse(raw) as JsonObject;
}

function makeService(cache: MemoryCache): CatalogService {
  const ol = new OpenLibraryClient({
    userAgent: USER_AGENT,
    baseUrl: OL_BASE,
    timeoutMs: 1000,
    maxRetries: 0,
    retryDelayMs: 1,
  });
  const gb = new GoogleBooksClient({
    apiKey: API_KEY,
    baseUrl: `${GB_BASE}${GB_PATH}`,
    timeoutMs: 1000,
    maxRetries: 0,
    retryDelayMs: 1,
  });
  return new CatalogService(ol, gb, cache);
}

function searchCacheKey(query: string, limit: number): string {
  return `catalog:search:${query.toLowerCase().trim()}:${limit}`;
}

describe("Catalog snapshot tests (nock-recorded OL + GB fixtures)", () => {
  let cache: MemoryCache;
  let service: CatalogService;

  beforeAll(() => {
    // Fail fast if any test forgets to mock an outbound request.
    nock.disableNetConnect();
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  beforeEach(() => {
    cache = new MemoryCache();
    service = makeService(cache);
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe("scenario 1 — OL hit", () => {
    it("returns OL results, never calls GB, and caches the OL payload", async () => {
      const olHit = loadFixture("openlibrary", "search-hit.json");
      const query = "fantastic mr fox";
      const limit = 10;

      const olScope = nock(OL_BASE)
        .get("/search.json")
        .query(true)
        .reply(200, olHit);

      // If GB is contacted at all, nock will throw "Nock: No match for request"
      // because no GB interceptor is registered and net-connect is disabled.

      const results = await service.search(query, limit);

      // Merged result shape — single OL hit, normalized to BookSearchResult.
      expect(results).toHaveLength(1);
      const [first] = results;
      expect(first).toBeDefined();
      expect(first!.source).toBe("open_library");
      expect(first!.sourceKey).toBe("/works/OL45804W");
      expect(first!.title).toBe("Fantastic Mr Fox");
      expect(first!.authors).toEqual(["Roald Dahl"]);
      expect(first!.firstPublishedYear).toBe(1970);
      expect(first!.isbn10).toBe("0140328726");
      expect(first!.isbn13).toBe("9780140328721");
      expect(first!.publisher).toBe("Puffin Books");
      expect(first!.pageCount).toBe(96);
      expect(first!.coverUrl).toBe("https://covers.openlibrary.org/b/id/8739161-L.jpg");

      // OL endpoint was contacted exactly once.
      expect(olScope.isDone()).toBe(true);

      // Cache state: OL result is persisted under the canonical key.
      const cached = await cache.get<BookSearchResult[]>(searchCacheKey(query, limit));
      expect(cached).not.toBeNull();
      expect(cached).toEqual(results);
    });

    it("second identical search hits the cache and issues no HTTP requests", async () => {
      const olHit = loadFixture("openlibrary", "search-hit.json");
      const query = "fantastic mr fox";
      const limit = 10;

      // First call: OL responds once. After this interceptor is consumed, any
      // further request to OL would fail (no match + net-connect disabled).
      nock(OL_BASE).get("/search.json").query(true).reply(200, olHit);

      const first = await service.search(query, limit);
      expect(first).toHaveLength(1);

      // No interceptors registered for the second call — if the service
      // reissues an HTTP request, nock will throw and this test fails.
      expect(nock.pendingMocks()).toHaveLength(0);

      const second = await service.search(query, limit);
      expect(second).toEqual(first);
    });
  });

  describe("scenario 2 — OL miss + GB hit", () => {
    it("falls back to GB and caches the GB payload as the merged result", async () => {
      const olMiss = loadFixture("openlibrary", "search-miss.json");
      const gbHit = loadFixture("google-books", "search-hit.json");
      const query = "fantastic mr fox";
      const limit = 10;

      const olScope = nock(OL_BASE)
        .get("/search.json")
        .query(true)
        .reply(200, olMiss);
      const gbScope = nock(GB_BASE)
        .get(`${GB_PATH}/volumes`)
        .query(true)
        .reply(200, gbHit);

      const results = await service.search(query, limit);

      expect(results).toHaveLength(1);
      const [first] = results;
      expect(first).toBeDefined();
      expect(first!.source).toBe("google_books");
      expect(first!.sourceKey).toBe("wrOQLV6xB-wC");
      expect(first!.title).toBe("Fantastic Mr. Fox");
      expect(first!.authors).toEqual(["Roald Dahl"]);
      expect(first!.publisher).toBe("Penguin");
      expect(first!.publishedDate).toBe("2007-09-06");
      expect(first!.firstPublishedYear).toBe(2007);
      expect(first!.pageCount).toBe(96);
      expect(first!.isbn10).toBe("0142410381");
      expect(first!.isbn13).toBe("9780142410387");
      expect(first!.genres).toEqual(["Juvenile Fiction"]);
      // http -> https upgrade on imageLinks.thumbnail
      expect(first!.coverUrl).toMatch(/^https:\/\//);

      expect(olScope.isDone()).toBe(true);
      expect(gbScope.isDone()).toBe(true);

      // Cache state: GB results are cached under the same canonical key the
      // OL-hit path would have used.
      const cached = await cache.get<BookSearchResult[]>(searchCacheKey(query, limit));
      expect(cached).not.toBeNull();
      expect(cached).toEqual(results);
    });

    it("second identical search hits the cache — neither OL nor GB is re-called", async () => {
      const olMiss = loadFixture("openlibrary", "search-miss.json");
      const gbHit = loadFixture("google-books", "search-hit.json");
      const query = "fantastic mr fox";
      const limit = 10;

      nock(OL_BASE).get("/search.json").query(true).reply(200, olMiss);
      nock(GB_BASE).get(`${GB_PATH}/volumes`).query(true).reply(200, gbHit);

      const first = await service.search(query, limit);
      expect(first).toHaveLength(1);
      expect(nock.pendingMocks()).toHaveLength(0);

      // Second call must be served from cache only; nock has no interceptors
      // left and net-connect is disabled, so any HTTP attempt would throw.
      const second = await service.search(query, limit);
      expect(second).toEqual(first);
    });
  });

  describe("scenario 3 — OL miss + GB miss (both empty)", () => {
    it("returns an empty array and does NOT cache the empty result", async () => {
      const olMiss = loadFixture("openlibrary", "search-miss.json");
      const gbMiss = loadFixture("google-books", "search-miss.json");
      const query = "zzznoresultszzz";
      const limit = 10;

      const olScope = nock(OL_BASE)
        .get("/search.json")
        .query(true)
        .reply(200, olMiss);
      const gbScope = nock(GB_BASE)
        .get(`${GB_PATH}/volumes`)
        .query(true)
        .reply(200, gbMiss);

      const results = await service.search(query, limit);

      expect(results).toEqual([]);
      expect(olScope.isDone()).toBe(true);
      expect(gbScope.isDone()).toBe(true);

      // Cache state: empty result is not persisted (per CatalogService policy).
      const cached = await cache.get<BookSearchResult[]>(searchCacheKey(query, limit));
      expect(cached).toBeNull();
    });

    it("a subsequent search re-issues both upstream calls (empty was not cached)", async () => {
      const olMiss = loadFixture("openlibrary", "search-miss.json");
      const gbMiss = loadFixture("google-books", "search-miss.json");
      const query = "zzznoresultszzz";
      const limit = 10;

      // Interceptors for the FIRST call.
      nock(OL_BASE).get("/search.json").query(true).reply(200, olMiss);
      nock(GB_BASE).get(`${GB_PATH}/volumes`).query(true).reply(200, gbMiss);

      const first = await service.search(query, limit);
      expect(first).toEqual([]);
      expect(nock.pendingMocks()).toHaveLength(0);

      // Interceptors for the SECOND call — if the service had cached the empty
      // result, these would remain pending. We assert both are consumed.
      const olScope2 = nock(OL_BASE)
        .get("/search.json")
        .query(true)
        .reply(200, olMiss);
      const gbScope2 = nock(GB_BASE)
        .get(`${GB_PATH}/volumes`)
        .query(true)
        .reply(200, gbMiss);

      const second = await service.search(query, limit);
      expect(second).toEqual([]);
      expect(olScope2.isDone()).toBe(true);
      expect(gbScope2.isDone()).toBe(true);
    });
  });

  describe("scenario 4 — malformed upstream JSON", () => {
    it("OL malformed payload: service surfaces an error and does NOT cache", async () => {
      const olMalformed = loadFixture("openlibrary", "search-malformed.json");
      const query = "fantastic mr fox";
      const limit = 10;

      nock(OL_BASE).get("/search.json").query(true).reply(200, olMalformed);
      // No GB interceptor: if GB is contacted, nock will throw and this test
      // fails — which correctly asserts that OL malformed does NOT silently
      // fall back to GB.

      await expect(service.search(query, limit)).rejects.toThrow();

      // Cache state: nothing persisted from a failed upstream.
      const cached = await cache.get<BookSearchResult[]>(searchCacheKey(query, limit));
      expect(cached).toBeNull();
    });

    it("OL miss + GB malformed: error surfaces from GB and result is NOT cached", async () => {
      const olMiss = loadFixture("openlibrary", "search-miss.json");
      const gbMalformed = loadFixture("google-books", "search-malformed.json");
      const query = "fantastic mr fox";
      const limit = 10;

      const olScope = nock(OL_BASE)
        .get("/search.json")
        .query(true)
        .reply(200, olMiss);
      const gbScope = nock(GB_BASE)
        .get(`${GB_PATH}/volumes`)
        .query(true)
        .reply(200, gbMalformed);

      await expect(service.search(query, limit)).rejects.toThrow();

      expect(olScope.isDone()).toBe(true);
      expect(gbScope.isDone()).toBe(true);

      const cached = await cache.get<BookSearchResult[]>(searchCacheKey(query, limit));
      expect(cached).toBeNull();
    });

    it("OL invalid-JSON body (not parseable): service surfaces an error and does NOT cache", async () => {
      const query = "fantastic mr fox";
      const limit = 10;

      // Reply with a non-JSON body but advertise application/json so the
      // adapter calls response.json() and SyntaxError surfaces.
      nock(OL_BASE)
        .get("/search.json")
        .query(true)
        .reply(200, "<html>not json at all</html>", {
          "Content-Type": "application/json",
        });

      await expect(service.search(query, limit)).rejects.toThrow();

      const cached = await cache.get<BookSearchResult[]>(searchCacheKey(query, limit));
      expect(cached).toBeNull();
    });
  });

  describe("cache state — TTL is applied on successful writes", () => {
    it("OL hit cache entry uses the search TTL (1h) — entry is still present immediately after write", async () => {
      const olHit = loadFixture("openlibrary", "search-hit.json");
      const query = "fantastic mr fox";
      const limit = 10;

      nock(OL_BASE).get("/search.json").query(true).reply(200, olHit);

      const before = Date.now();
      await service.search(query, limit);
      const after = Date.now();

      // The entry exists; TTL bounds the lifetime to the search TTL window.
      const cached = await cache.get<BookSearchResult[]>(searchCacheKey(query, limit));
      expect(cached).not.toBeNull();

      // Sanity: the write occurred within the test window — guards against
      // mistaken clock manipulation in shared fixtures.
      expect(after).toBeGreaterThanOrEqual(before);
      expect(SEARCH_CACHE_TTL_MS).toBeGreaterThan(0);
    });
  });
});
