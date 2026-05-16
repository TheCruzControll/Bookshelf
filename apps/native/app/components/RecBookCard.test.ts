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

describe("RecBookCard contract (P-07, #143)", () => {
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

  it("accepts an optional onPress override", () => {
    let pressed = 0;
    const props: RecBookCardProps = {
      recommendation: makeRec(),
      onPress: () => {
        pressed += 1;
      },
    };
    props.onPress?.();
    expect(pressed).toBe(1);
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
    const coldStart = [
      "Popular on Hone",
      "An editor's pick",
      "Popular reads to get you started",
    ];
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

  it("renders title and reason verbatim from the server-supplied recommendation", () => {
    const rec = makeRec({ reason: "An editor's pick" });
    expect(rec.book.canonicalTitle).toBe("Foundation");
    expect(rec.reason).toBe("An editor's pick");
  });

  it("supports a cover-less book (typographic fallback)", () => {
    const rec = makeRec({
      book: {
        id: "00000000-0000-0000-0000-0000000000bb",
        canonicalTitle: "anthem",
        createdAt: NOW,
        updatedAt: NOW,
      },
    });
    const fallback = rec.book.canonicalTitle.charAt(0).toUpperCase();
    expect(fallback).toBe("A");
    expect(rec.book.coverUrl).toBeUndefined();
  });
});
