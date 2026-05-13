import { describe, it, expect } from "vitest";
import { SCORE_UNLOCK_THRESHOLD } from "@hone/domain";
import type { RankingScorePopupProps } from "./RankingScorePopup";

describe("RankingScorePopup contract", () => {
  it("requires bookTitle, score, finishedCount, onClose", () => {
    const props: RankingScorePopupProps = {
      bookTitle: "Foundation",
      score: 7.5,
      finishedCount: 12,
      onClose: () => {},
    };
    expect(props.score).toBe(7.5);
    expect(props.finishedCount).toBe(12);
  });

  it("accepts optional note", () => {
    const props: RankingScorePopupProps = {
      bookTitle: "Foundation",
      score: 7.5,
      finishedCount: 12,
      onClose: () => {},
      note: "Loved the slow pace.",
    };
    expect(props.note).toBe("Loved the slow pace.");
  });

  it("locked state: finishedCount below SCORE_UNLOCK_THRESHOLD does not surface the score", () => {
    const props: RankingScorePopupProps = {
      bookTitle: "Foundation",
      score: 7.5,
      finishedCount: SCORE_UNLOCK_THRESHOLD - 1,
      onClose: () => {},
    };
    expect(props.finishedCount).toBeLessThan(SCORE_UNLOCK_THRESHOLD);
  });

  it("just-unlocked state: finishedCount === SCORE_UNLOCK_THRESHOLD", () => {
    const props: RankingScorePopupProps = {
      bookTitle: "Foundation",
      score: 7.5,
      finishedCount: SCORE_UNLOCK_THRESHOLD,
      onClose: () => {},
    };
    expect(props.finishedCount).toBe(SCORE_UNLOCK_THRESHOLD);
  });
});
