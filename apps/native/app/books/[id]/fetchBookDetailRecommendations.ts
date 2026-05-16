import type { RecommendationInput } from "@hone/domain";

/**
 * Server-side fetcher for the native Book Detail "you might also like"
 * carousel (P-07, #143).
 *
 * In v1 this returns an empty list — the tRPC client wiring for the
 * native surface is not yet in place. Mirrors
 * `apps/web/app/books/[id]/fetchBookDetailRecommendations.ts`.
 *
 * The `bookId` is the canonical Hone book id of the currently-rendered
 * Book Detail screen; the caller will pass it on to the tRPC
 * `recommendations.forBookDetail` procedure so the rail can exclude
 * the current book from its own recommendations.
 */
export async function fetchBookDetailRecommendations(
  _bookId: string,
): Promise<RecommendationInput[]> {
  return [];
}
