import { TRPCError } from "@trpc/server";
import {
  AppServices,
  DEFAULT_REC_CACHE_TTL_MS,
  getCachedRecs,
  RecsForBookDetailInputSchema,
  RecsForDiscoverInputSchema,
  RecsListOutputSchema,
  setCachedRecs,
} from "@hone/domain";
import type {
  Recommendation,
  RecommendationInput,
  RecSurface,
} from "@hone/domain";
import { router, publicProcedure } from "./trpc";

/**
 * Hydrate a `Recommendation` (from the domain layer) into the shape the
 * tRPC client receives. Dates on `book` are converted to ISO strings by
 * the serializer, but the wire shape we declare here matches
 * `RecommendationSchema` (which accepts `z.date()`).
 *
 * This helper exists so we can normalize a couple of edge cases in one
 * place — book without subtitle/description/cover end up as `undefined`
 * keys rather than `null`, which zod rejects.
 */
function toRecommendationInput(rec: Recommendation): RecommendationInput {
  const book = rec.book;
  return {
    book: {
      id: book.id,
      canonicalTitle: book.canonicalTitle,
      ...(book.subtitle !== undefined ? { subtitle: book.subtitle } : {}),
      ...(book.description !== undefined
        ? { description: book.description }
        : {}),
      ...(book.coverUrl !== undefined ? { coverUrl: book.coverUrl } : {}),
      ...(book.firstPublishedYear !== undefined
        ? { firstPublishedYear: book.firstPublishedYear }
        : {}),
      createdAt: book.createdAt,
      updatedAt: book.updatedAt,
    },
    score: rec.score,
    reason: rec.reason,
  };
}

/**
 * Fetch recommendations for a (viewer, surface) pair, consulting the
 * 5-minute rec cache from #140 first. On miss, calls the social service
 * and writes the result back to the cache.
 */
async function fetchSurfaceRecs(args: {
  services: AppServices;
  cache: Parameters<typeof getCachedRecs>[0];
  userId: string;
  surface: RecSurface;
  limit: number;
}): Promise<RecommendationInput[]> {
  const { services, cache, userId, surface, limit } = args;

  const cached = await getCachedRecs(cache, userId, surface);
  if (cached) return cached.slice(0, limit);

  const recs = await services.social.getRecommendations(userId, limit);
  const hydrated = recs.map(toRecommendationInput);
  await setCachedRecs(cache, userId, surface, hydrated, DEFAULT_REC_CACHE_TTL_MS);
  return hydrated;
}

export const recommendationsRouter = router({
  /**
   * Recommendations for the Discover tab (P-06, #142).
   *
   * Returns up to `limit` recommendations for the authenticated viewer,
   * served from the per-surface rec cache when available.
   */
  forDiscover: publicProcedure
    .input(RecsForDiscoverInputSchema)
    .output(RecsListOutputSchema)
    .query(async ({ input, ctx }) => {
      if (!ctx.repositories) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Repositories not configured",
        });
      }
      if (!ctx.identity) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }
      const identity = ctx.identity;
      const services = new AppServices(ctx.repositories, {
        getCurrentIdentity: async () => identity,
      });
      const recommendations = await fetchSurfaceRecs({
        services,
        cache: ctx.cache ?? null,
        userId: identity.userId,
        surface: "discover",
        limit: input.limit,
      });
      return { recommendations };
    }),

  /**
   * Recommendations for the Book Detail "you might also like" rail
   * (P-06, #142). v1 reuses the viewer-level rec list and trims to the
   * carousel size; per-book personalization is a follow-up.
   */
  forBookDetail: publicProcedure
    .input(RecsForBookDetailInputSchema)
    .output(RecsListOutputSchema)
    .query(async ({ input, ctx }) => {
      if (!ctx.repositories) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Repositories not configured",
        });
      }
      if (!ctx.identity) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }
      const identity = ctx.identity;
      const services = new AppServices(ctx.repositories, {
        getCurrentIdentity: async () => identity,
      });
      const recommendations = await fetchSurfaceRecs({
        services,
        cache: ctx.cache ?? null,
        userId: identity.userId,
        surface: "book_detail",
        limit: input.limit,
      });
      // Exclude the current book from its own rail.
      const filtered = recommendations.filter((r) => r.book.id !== input.bookId);
      return { recommendations: filtered };
    }),
});
