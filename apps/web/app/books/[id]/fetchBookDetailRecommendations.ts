import type { RecommendationInput } from "@hone/domain";

/**
 * Server-side fetcher for the Book Detail "you might also like" carousel
 * (P-06, #142).
 *
 * In v1 this returns an empty list — the tRPC client wiring for the web
 * surface is not yet in place (the web app is RSC-only). Server actions
 * or a server-side tRPC caller can drop in here later without changing
 * the page component contract.
 *
 * The `bookId` is the canonical Hone book id of the currently-rendered
 * Book Detail page; the caller will pass it on to the tRPC
 * `recommendations.forBookDetail` procedure so the rail can exclude
 * the current book from its own recommendations.
 */
export async function fetchBookDetailRecommendations(
  _bookId: string,
): Promise<RecommendationInput[]> {
  return [];
}
