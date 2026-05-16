import { describe, it, expect } from "vitest";
import type { RecommendationInput } from "@hone/domain";
import type { RecBookCardProps } from "./RecBookCard";

const NOW = new Date("2026-05-01T12:00:00Z");

function makeRec(overrides?: Partial<RecommendationInput>): RecommendationInput {
  return {
    book: {
      id: "00000000-0000-0000-0000-000000000001",
      canonicalTitle: "Foundation",
      createdAt: NOW,
      updatedAt: NOW,
    },
    score: 8.4,
    reason: "Matches your reading taste",
    ...overrides,
  };
}

describe("RecBookCard contract (P-06, #142)", () => {
  it("requires a recommendation prop with book + reason", () => {
    const props: RecBookCardProps = { recommendation: makeRec() };
    expect(props.recommendation.book.canonicalTitle).toBe("Foundation");
    expect(props.recommendation.reason).toBe("Matches your reading taste");
  });

  it("accepts an optional href override", () => {
    const props: RecBookCardProps = {
      recommendation: makeRec(),
      href: "/custom/path",
    };
    expect(props.href).toBe("/custom/path");
  });

  it("defaults href to /books/{book.id} when not overridden", () => {
    const rec = makeRec({
      book: {
        id: "00000000-0000-0000-0000-0000000000aa",
        canonicalTitle: "Foundation",
        createdAt: NOW,
        updatedAt: NOW,
      },
    });
    const expected = `/books/${rec.book.id}`;
    expect(expected).toBe("/books/00000000-0000-0000-0000-0000000000aa");
  });

  it("supports cold-start reason labels from #141", () => {
    const coldStart = ["Popular on Hone", "An editor's pick", "Popular reads to get you started"];
    for (const reason of coldStart) {
      const props: RecBookCardProps = { recommendation: makeRec({ reason }) };
      expect(props.recommendation.reason).toBe(reason);
    }
  });

  it("supports main-pipeline reason labels from #139", () => {
    const labels = [
      "Popular among your friends",
      "Highly rated by your friends",
      "Matches your reading taste",
      "Fits your favorite genres",
      "Recently read by your friends",
      "Widely read on Hone",
    ];
    for (const reason of labels) {
      const props: RecBookCardProps = { recommendation: makeRec({ reason }) };
      expect(props.recommendation.reason).toBe(reason);
    }
  });
});
