import { describe, it, expect } from "vitest";
import { fetchDiscoverRecommendations } from "./fetchDiscoverRecommendations";

describe("fetchDiscoverRecommendations (P-07, #143)", () => {
  it("returns an empty array until the native tRPC client is wired", async () => {
    const recs = await fetchDiscoverRecommendations();
    expect(recs).toEqual([]);
  });

  it("returns a list type that the Discover screen can map over", async () => {
    const recs = await fetchDiscoverRecommendations();
    expect(Array.isArray(recs)).toBe(true);
    for (const rec of recs) {
      expect(rec.book.canonicalTitle.length).toBeGreaterThan(0);
      expect(rec.reason.length).toBeGreaterThan(0);
    }
  });
});
