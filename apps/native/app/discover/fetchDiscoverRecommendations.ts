import type { RecommendationInput } from "@hone/domain";

/**
 * Server-side fetcher for the native Discover screen (P-07, #143).
 *
 * In v1 this returns an empty list — the tRPC client wiring for the
 * native surface is not yet in place. The page contract and component
 * tree will not change when this is replaced with a live caller.
 *
 * Mirrors `apps/web/app/discover/fetchDiscoverRecommendations.ts`.
 * Exported so tests can stub it via module mocking.
 */
export async function fetchDiscoverRecommendations(): Promise<RecommendationInput[]> {
  return [];
}
