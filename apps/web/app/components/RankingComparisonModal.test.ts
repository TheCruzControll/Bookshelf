import { describe, it, expect } from "vitest";
import type {
  ComparisonBook,
  RankingComparisonModalProps,
} from "./RankingComparisonModal";

function makeBook(overrides?: Partial<ComparisonBook>): ComparisonBook {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    title: "Foundation",
    author: "Isaac Asimov",
    ...overrides,
  };
}

describe("RankingComparisonModal contract", () => {
  it("requires newBook, existingBook, scoresUnlocked, onPick", () => {
    const props: RankingComparisonModalProps = {
      newBook: makeBook(),
      existingBook: makeBook({ id: "x", title: "Dune", author: "Frank Herbert", score: 8.5 }),
      scoresUnlocked: true,
      onPick: async () => {},
    };
    expect(props.newBook.title).toBe("Foundation");
    expect(props.existingBook.score).toBe(8.5);
    expect(props.scoresUnlocked).toBe(true);
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

  it("existing book score is accepted even when scores are locked (component decides whether to render)", () => {
    const props: RankingComparisonModalProps = {
      newBook: makeBook(),
      existingBook: makeBook({ score: 5.5 }),
      scoresUnlocked: false,
      onPick: async () => {},
    };
    expect(props.existingBook.score).toBe(5.5);
    expect(props.scoresUnlocked).toBe(false);
  });

  it("new book may carry excerpt/cover; new book score is never expected", () => {
    const props: RankingComparisonModalProps = {
      newBook: makeBook({ coverUrl: "https://example.com/cover.jpg", excerpt: "A note." }),
      existingBook: makeBook(),
      scoresUnlocked: true,
      onPick: async () => {},
    };
    expect(props.newBook.coverUrl).toBe("https://example.com/cover.jpg");
    expect(props.newBook.excerpt).toBe("A note.");
    expect(props.newBook.score).toBeUndefined();
  });
});
