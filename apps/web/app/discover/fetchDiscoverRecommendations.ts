import type { RecommendationInput } from "@hone/domain";

/**
 * Server-side fetcher for the Discover page (P-06, #142).
 *
 * In v1 this returns an empty list — the tRPC client wiring for the web
 * surface is not yet in place (the web app is RSC-only). Server actions
 * or a server-side tRPC caller can drop in here later without changing
 * the page component contract.
 *
 * Exported so tests can stub it via module mocking.
 */
export async function fetchDiscoverRecommendations(): Promise<RecommendationInput[]> {
  return [];
}
