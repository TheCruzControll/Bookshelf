import type { CatalogProvider, BookSearchResult } from "@hone/domain";
import { rankSearchResults } from "@hone/domain";
import type { Cache } from "@hone/cache";

/** Cache TTL for search results: 1 hour */
const SEARCH_CACHE_TTL_MS = 60 * 60 * 1000;

/** Cache TTL for ISBN lookups: 24 hours (more stable data) */
const ISBN_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Build the cache key for a search. Locale is part of the key because the
 * F-07 re-ranker (#73) applies a locale-language preference boost — two
 * viewers with different locales legitimately want different orderings for
 * the same `(query, limit)` pair, so they cannot share a cache entry.
 */
function searchCacheKey(query: string, limit: number, viewerLocale: string | undefined): string {
  const localePart = viewerLocale ? viewerLocale.toLowerCase() : "";
  return `catalog:search:${query.toLowerCase().trim()}:${limit}:${localePart}`;
}

function isbnCacheKey(isbn: string): string {
  return `catalog:isbn:${isbn.replace(/[-\s]/g, "")}`;
}

/**
 * Composes Open Library (primary) and Google Books (fallback) providers.
 *
 * Strategy:
 * 1. Check cache for identical query (keyed by `(query, limit, locale)`)
 * 2. Search OL first
 * 3. On OL miss (zero results), fall back to GB
 * 4. Apply F-07 (#73) re-rank: exact title/author boost, edition-count
 *    log-scale, locale-language preference, publish-year tiebreak.
 * 5. Cache the re-ranked results and return them.
 *
 * The re-rank runs over the raw provider results before caching so cached
 * values are already in display order — subsequent hits don't have to
 * re-rank on every request.
 */
export class CatalogService implements CatalogProvider {
  constructor(
    private readonly ol: CatalogProvider,
    private readonly gb: CatalogProvider,
    private readonly cache?: Cache,
  ) {}

  async search(
    query: string,
    limit: number,
    viewerLocale?: string,
  ): Promise<BookSearchResult[]> {
    const key = searchCacheKey(query, limit, viewerLocale);

    // 1. Check cache
    const cached = await this.cache?.get<BookSearchResult[]>(key);
    if (cached) return cached;

    // 2. OL primary
    const olResults = await this.ol.search(query, limit);
    if (olResults.length > 0) {
      const ranked = rankSearchResults(olResults, query, viewerLocale);
      await this.cache?.set(key, ranked, SEARCH_CACHE_TTL_MS);
      return ranked;
    }

    // 3. GB fallback on OL miss
    const gbResults = await this.gb.search(query, limit);
    if (gbResults.length > 0) {
      const ranked = rankSearchResults(gbResults, query, viewerLocale);
      await this.cache?.set(key, ranked, SEARCH_CACHE_TTL_MS);
      return ranked;
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
