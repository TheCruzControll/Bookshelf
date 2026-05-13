/**
 * Recommendation cache helpers (P-04, #140).
 *
 * Caches a per-(viewer, surface) recommendation list to avoid recomputing
 * the rec pipeline on every scroll. Default TTL is 5 minutes; callers can
 * override per-surface if needed.
 *
 * Hexagonal-friendly: the cache is consumed through a minimal structural
 * port so this module stays dependency-free. `@hone/cache`'s `Cache`
 * satisfies the port by shape.
 */

import type { RecSurface, RecommendationInput } from "./schemas/recs";
import type { EntityId } from "./types";

/**
 * Minimal cache port required by the rec cache. Matches the relevant
 * subset of `@hone/cache`'s `Cache` interface so a `Cache` instance can
 * be passed directly.
 */
export interface RecCachePort {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlMs: number): Promise<void>;
  del(key: string): Promise<void>;
}

/** Default rec cache TTL — 5 minutes (issue #140). */
export const DEFAULT_REC_CACHE_TTL_MS = 5 * 60 * 1000;

/** Build the cache key for a (viewer, surface) recommendation list. */
export function recCacheKey(userId: EntityId, surface: RecSurface): string {
  return `recs:${surface}:${userId}`;
}

/**
 * Fetch a cached rec list for the (viewer, surface) pair.
 * Returns null on miss or when no cache is configured.
 */
export async function getCachedRecs(
  cache: RecCachePort | null | undefined,
  userId: EntityId,
  surface: RecSurface,
): Promise<RecommendationInput[] | null> {
  if (!cache) return null;
  return cache.get<RecommendationInput[]>(recCacheKey(userId, surface));
}

/**
 * Store a rec list for the (viewer, surface) pair. `ttlMs` defaults to
 * `DEFAULT_REC_CACHE_TTL_MS` and must be a positive integer when provided.
 */
export async function setCachedRecs(
  cache: RecCachePort | null | undefined,
  userId: EntityId,
  surface: RecSurface,
  recs: RecommendationInput[],
  ttlMs: number = DEFAULT_REC_CACHE_TTL_MS,
): Promise<void> {
  if (!cache) return;
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new Error(`ttlMs must be a positive number, got ${ttlMs}`);
  }
  await cache.set(recCacheKey(userId, surface), recs, ttlMs);
}

/**
 * Invalidate cached recs for a viewer. When `surface` is omitted the
 * helper clears all known surfaces for the viewer.
 */
export async function invalidateRecCache(
  cache: RecCachePort | null | undefined,
  userId: EntityId,
  surface?: RecSurface,
): Promise<void> {
  if (!cache) return;
  const surfaces: RecSurface[] = surface ? [surface] : ["discover", "book_detail"];
  await Promise.all(surfaces.map((s) => cache.del(recCacheKey(userId, s))));
}
