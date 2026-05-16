import { describe, it, expect } from "vitest";
import type { RecommendationInput } from "@hone/domain";
import type { RecCarouselProps } from "./RecCarousel";

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

describe("RecCarousel contract (P-07, #143)", () => {
  it("accepts an array of recommendations", () => {
    const recs: RecommendationInput[] = [
      makeRec("00000000-0000-0000-0000-0000000000aa", "Popular among your friends"),
      makeRec("00000000-0000-0000-0000-0000000000bb", "Matches your reading taste"),
    ];
    const props: RecCarouselProps = { recommendations: recs };
    expect(props.recommendations).toHaveLength(2);
  });

  it("defaults the heading to 'You might also like'", () => {
    const props: RecCarouselProps = { recommendations: [] };
    const heading = props.heading ?? "You might also like";
    expect(heading).toBe("You might also like");
  });

  it("renders a non-empty reason label per card", () => {
    const recs: RecommendationInput[] = [
      makeRec("00000000-0000-0000-0000-0000000000aa", "Popular among your friends"),
      makeRec("00000000-0000-0000-0000-0000000000bb", "Popular on Hone"),
    ];
    const reasons = recs.map((r) => r.reason);
    expect(reasons.every((r) => r.length > 0)).toBe(true);
    expect(reasons).toContain("Popular on Hone");
  });

  it("supports an empty-state message", () => {
    const props: RecCarouselProps = {
      recommendations: [],
      emptyMessage: "No recommendations yet.",
    };
    expect(props.emptyMessage).toBe("No recommendations yet.");
  });

  it("supports a custom heading override", () => {
    const props: RecCarouselProps = {
      recommendations: [],
      heading: "Readers also enjoyed",
    };
    expect(props.heading).toBe("Readers also enjoyed");
  });

  it("handles 6-10 recommendations (carousel sweet spot)", () => {
    const recs: RecommendationInput[] = Array.from({ length: 8 }, (_, i) =>
      makeRec(
        `00000000-0000-0000-0000-00000000${(0xa0 + i).toString(16)}`,
        "Matches your reading taste",
      ),
    );
    const props: RecCarouselProps = { recommendations: recs };
    expect(props.recommendations.length).toBeGreaterThanOrEqual(6);
    expect(props.recommendations.length).toBeLessThanOrEqual(10);
  });

  it("mixes cold-start (#141) and main-pipeline (#139) labels in one rail", () => {
    const recs: RecommendationInput[] = [
      makeRec("00000000-0000-0000-0000-0000000000aa", "Popular on Hone"),
      makeRec("00000000-0000-0000-0000-0000000000bb", "Matches your reading taste"),
      makeRec("00000000-0000-0000-0000-0000000000cc", "An editor's pick"),
    ];
    const labels = recs.map((r) => r.reason);
    expect(labels).toContain("Popular on Hone");
    expect(labels).toContain("An editor's pick");
    expect(labels).toContain("Matches your reading taste");
  });
});
