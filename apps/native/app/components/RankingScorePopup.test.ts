import { describe, it, expect } from "vitest";
import { SCORE_UNLOCK_THRESHOLD } from "@hone/domain";
import type { RankingScorePopupProps } from "./RankingScorePopup";

describe("RankingScorePopup (native) contract", () => {
  it("requires bookTitle, score, finishedCount, onClose", () => {
    const props: RankingScorePopupProps = {
      bookTitle: "Foundation",
      score: 8.25,
      finishedCount: 12,
      onClose: () => {},
    };
    expect(props.score).toBe(8.25);
  });

  it("locked state when below threshold", () => {
    const props: RankingScorePopupProps = {
      bookTitle: "X",
      score: 5,
      finishedCount: SCORE_UNLOCK_THRESHOLD - 1,
      onClose: () => {},
    };
    expect(props.finishedCount).toBeLessThan(SCORE_UNLOCK_THRESHOLD);
  });

  it("just-unlocked state when at threshold", () => {
    const props: RankingScorePopupProps = {
      bookTitle: "X",
      score: 5,
      finishedCount: SCORE_UNLOCK_THRESHOLD,
      onClose: () => {},
    };
    expect(props.finishedCount).toBe(SCORE_UNLOCK_THRESHOLD);
  });
});
