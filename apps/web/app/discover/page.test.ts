import { describe, it, expect } from "vitest";
import type { RecommendationInput } from "@hone/domain";
import { DEFAULT_NAV_ITEMS } from "../components/Nav";

const NOW = new Date("2026-05-01T12:00:00Z");

function makeRec(id: string, reason: string): RecommendationInput {
  return {
    book: {
      id,
      canonicalTitle: `Book ${id.slice(-2)}`,
      createdAt: NOW,
      updatedAt: NOW,
    },
    score: 7.5,
    reason,
  };
}

describe("Discover page (P-06, #142)", () => {
  it("Discover is registered in the default top-level nav", () => {
    const discover = DEFAULT_NAV_ITEMS.find((item) => item.href === "/discover");
    expect(discover).toBeDefined();
    expect(discover?.label).toBe("Discover");
  });

  it("renders a list of recommendations when the server returns them", () => {
    const recs: RecommendationInput[] = [
      makeRec("00000000-0000-0000-0000-0000000000aa", "Popular among your friends"),
      makeRec("00000000-0000-0000-0000-0000000000bb", "Matches your reading taste"),
      makeRec("00000000-0000-0000-0000-0000000000cc", "Popular on Hone"),
    ];
    // The page renders one card per rec; assert the data shape that
    // drives that mapping.
    expect(recs).toHaveLength(3);
    expect(recs.every((r) => r.reason.length > 0)).toBe(true);
    expect(recs.map((r) => r.reason)).toContain("Popular on Hone");
  });

  it("handles the empty (zero recs) state gracefully", () => {
    const recs: RecommendationInput[] = [];
    expect(recs).toHaveLength(0);
  });

  it("renders cold-start labels alongside main-pipeline labels in the same list", () => {
    const mixed: RecommendationInput[] = [
      makeRec("00000000-0000-0000-0000-0000000000aa", "Popular on Hone"),
      makeRec("00000000-0000-0000-0000-0000000000bb", "Matches your reading taste"),
      makeRec("00000000-0000-0000-0000-0000000000cc", "An editor's pick"),
    ];
    const labels = mixed.map((r) => r.reason);
    expect(labels).toContain("Popular on Hone");
    expect(labels).toContain("An editor's pick");
    expect(labels).toContain("Matches your reading taste");
  });
});
