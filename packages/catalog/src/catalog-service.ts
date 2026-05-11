import type { CatalogProvider, BookSearchResult } from "@hone/domain";
import type { Cache } from "@hone/cache";

/** Cache TTL for search results: 1 hour */
const SEARCH_CACHE_TTL_MS = 60 * 60 * 1000;

/** Cache TTL for ISBN lookups: 24 hours (more stable data) */
const ISBN_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function searchCacheKey(query: string, limit: number): string {
  return `catalog:search:${query.toLowerCase().trim()}:${limit}`;
}

function isbnCacheKey(isbn: string): string {
  return `catalog:isbn:${isbn.replace(/[-\s]/g, "")}`;
}

/**
 * Composes Open Library (primary) and Google Books (fallback) providers.
 *
 * Strategy:
 * 1. Check cache for identical query
 * 2. Search OL first
 * 3. On OL miss (zero results), fall back to GB
 * 4. Cache and return results
 */
export class CatalogService implements CatalogProvider {
  constructor(
    private readonly ol: CatalogProvider,
    private readonly gb: CatalogProvider,
    private readonly cache?: Cache,
  ) {}

  async search(query: string, limit: number): Promise<BookSearchResult[]> {
    const key = searchCacheKey(query, limit);

    // 1. Check cache
    const cached = await this.cache?.get<BookSearchResult[]>(key);
    if (cached) return cached;

    // 2. OL primary
    const olResults = await this.ol.search(query, limit);
    if (olResults.length > 0) {
      await this.cache?.set(key, olResults, SEARCH_CACHE_TTL_MS);
      return olResults;
    }

    // 3. GB fallback on OL miss
    const gbResults = await this.gb.search(query, limit);
    if (gbResults.length > 0) {
      await this.cache?.set(key, gbResults, SEARCH_CACHE_TTL_MS);
    }

    return gbResults;
  }

  async lookupByIsbn(isbn: string): Promise<BookSearchResult | null> {
    const key = isbnCacheKey(isbn);

    // 1. Check cache
    const cached = await this.cache?.get<BookSearchResult>(key);
    if (cached) return cached;

    // 2. OL primary
    const olResult = await this.ol.lookupByIsbn(isbn);
    if (olResult) {
      await this.cache?.set(key, olResult, ISBN_CACHE_TTL_MS);
      return olResult;
    }

    // 3. GB fallback on OL miss
    const gbResult = await this.gb.lookupByIsbn(isbn);
    if (gbResult) {
      await this.cache?.set(key, gbResult, ISBN_CACHE_TTL_MS);
    }

    return gbResult;
  }
}
