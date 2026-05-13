import { describe, it, expect } from "vitest";
import type { RankingFlowProps } from "./RankingFlow";
import type { ComparisonBook } from "./RankingComparisonModal";

function makeBook(overrides?: Partial<ComparisonBook>): ComparisonBook {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    title: "Foundation",
    author: "Isaac Asimov",
    ...overrides,
  };
}

describe("RankingFlow contract", () => {
  it("requires newBook, scoresUnlocked, finishedCountAfterSave, and three handlers", () => {
    const props: RankingFlowProps = {
      newBook: makeBook(),
      scoresUnlocked: false,
      finishedCountAfterSave: 7,
      onBucketChosen: async () => ({ next: makeBook({ id: "x" }) }),
      onComparisonPicked: async () => ({ next: null, finalScore: 7.5 }),
      onClose: () => {},
    };
    expect(props.newBook.title).toBe("Foundation");
    expect(props.scoresUnlocked).toBe(false);
    expect(props.finishedCountAfterSave).toBe(7);
  });

  it("onBucketChosen returns the first comparison candidate (or null for empty library)", async () => {
    const props: RankingFlowProps = {
      newBook: makeBook(),
      scoresUnlocked: false,
      finishedCountAfterSave: 1,
      onBucketChosen: async (b) => {
        expect([1, 2, 3, 4, 5]).toContain(b);
        return { next: null };
      },
      onComparisonPicked: async () => ({ next: null, finalScore: 10 }),
      onClose: () => {},
    };
    const result = await props.onBucketChosen(3);
    expect(result.next).toBeNull();
  });

  it("onComparisonPicked returns next OR finalScore, never both", async () => {
    const intermediate: RankingFlowProps = {
      newBook: makeBook(),
      scoresUnlocked: true,
      finishedCountAfterSave: 20,
      onBucketChosen: async () => ({ next: makeBook() }),
      onComparisonPicked: async () => ({ next: makeBook({ id: "y" }), finalScore: null }),
      onClose: () => {},
    };
    const next = await intermediate.onComparisonPicked("new");
    expect(next.finalScore).toBeNull();
    expect(next.next).not.toBeNull();

    const final: RankingFlowProps = {
      ...intermediate,
      onComparisonPicked: async () => ({ next: null, finalScore: 8.25 }),
    };
    const done = await final.onComparisonPicked("existing");
    expect(done.next).toBeNull();
    expect(done.finalScore).toBe(8.25);
  });
});
