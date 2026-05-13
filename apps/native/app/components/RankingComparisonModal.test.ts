import { describe, it, expect } from "vitest";
import type { ComparisonBook, RankingComparisonModalProps } from "./RankingComparisonModal";

function makeBook(overrides?: Partial<ComparisonBook>): ComparisonBook {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    title: "Foundation",
    author: "Isaac Asimov",
    ...overrides,
  };
}

describe("RankingComparisonModal (native) contract", () => {
  it("requires newBook, existingBook, scoresUnlocked, onPick", () => {
    const props: RankingComparisonModalProps = {
      newBook: makeBook(),
      existingBook: makeBook({ id: "x", title: "Dune", author: "Frank Herbert", score: 8.5 }),
      scoresUnlocked: true,
      onPick: async () => {},
    };
    expect(props.newBook.title).toBe("Foundation");
    expect(props.existingBook.score).toBe(8.5);
  });

  it("onPick receives 'new' or 'existing'", async () => {
    const picks: Array<"new" | "existing"> = [];
    const props: RankingComparisonModalProps = {
      newBook: makeBook(),
      existingBook: makeBook(),
      scoresUnlocked: false,
      onPick: async (c) => {
        picks.push(c);
      },
    };
    await props.onPick("new");
    await props.onPick("existing");
    expect(picks).toEqual(["new", "existing"]);
  });

  it("new book never carries a score type-level (always undefined in usage)", () => {
    const props: RankingComparisonModalProps = {
      newBook: makeBook({ excerpt: "A note." }),
      existingBook: makeBook(),
      scoresUnlocked: true,
      onPick: async () => {},
    };
    expect(props.newBook.score).toBeUndefined();
  });
});
