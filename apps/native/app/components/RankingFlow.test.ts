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

describe("RankingFlow (native) contract", () => {
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
  });

  it("onBucketChosen returns null next when library is empty", async () => {
    const props: RankingFlowProps = {
      newBook: makeBook(),
      scoresUnlocked: false,
      finishedCountAfterSave: 1,
      onBucketChosen: async () => ({ next: null }),
      onComparisonPicked: async () => ({ next: null, finalScore: 10 }),
      onClose: () => {},
    };
    const result = await props.onBucketChosen(3);
    expect(result.next).toBeNull();
  });

  it("onComparisonPicked returns next OR finalScore but never both populated", async () => {
    const intermediate: RankingFlowProps = {
      newBook: makeBook(),
      scoresUnlocked: true,
      finishedCountAfterSave: 25,
      onBucketChosen: async () => ({ next: makeBook() }),
      onComparisonPicked: async () => ({ next: makeBook({ id: "y" }), finalScore: null }),
      onClose: () => {},
    };
    const next = await intermediate.onComparisonPicked("new");
    expect(next.finalScore).toBeNull();
    expect(next.next).not.toBeNull();

    const final: RankingFlowProps = {
      ...intermediate,
      onComparisonPicked: async () => ({ next: null, finalScore: 7.5 }),
    };
    const done = await final.onComparisonPicked("existing");
    expect(done.next).toBeNull();
    expect(done.finalScore).toBe(7.5);
  });
});
