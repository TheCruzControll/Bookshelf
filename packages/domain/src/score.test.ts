import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { scoreFromRank, isScoreUnlocked, SCORE_UNLOCK_THRESHOLD, redactScore } from "./score";
import type { Ranking } from "./types";

describe("scoreFromRank", () => {
  it("returns 10 when there is exactly one ranked book", () => {
    expect(scoreFromRank(1, 1)).toBe(10);
  });

  it("returns 10 for position 1 (best) with multiple books", () => {
    expect(scoreFromRank(1, 10)).toBe(10);
  });

  it("returns 0 for the last position with multiple books", () => {
    expect(scoreFromRank(10, 10)).toBe(0);
  });

  it("returns 5 for the middle position of 3 books", () => {
    expect(scoreFromRank(2, 3)).toBe(5);
  });

  it("returns correct interpolation for position 2 of 5", () => {
    // (5 - 2) / (5 - 1) * 10 = 3/4 * 10 = 7.5
    expect(scoreFromRank(2, 5)).toBe(7.5);
  });

  it("returns correct interpolation for position 3 of 5", () => {
    // (5 - 3) / (5 - 1) * 10 = 2/4 * 10 = 5.0
    expect(scoreFromRank(3, 5)).toBe(5);
  });

  it("returns correct interpolation for position 4 of 5", () => {
    // (5 - 4) / (5 - 1) * 10 = 1/4 * 10 = 2.5
    expect(scoreFromRank(4, 5)).toBe(2.5);
  });

  it("rounds to 2 decimal places", () => {
    // position 2 of 7: (7-2)/(7-1)*10 = 5/6*10 = 8.333...
    const result = scoreFromRank(2, 7);
    expect(result).toBe(8.33);
    expect(result.toString().split(".")[1]?.length).toBeLessThanOrEqual(2);
  });

  it("returns 0 when total is 0 (edge case)", () => {
    expect(scoreFromRank(1, 0)).toBe(0);
  });

  it("returns 0 when position is 0 (edge case)", () => {
    expect(scoreFromRank(0, 5)).toBe(0);
  });

  it("returns 0 when total is negative (edge case)", () => {
    expect(scoreFromRank(1, -1)).toBe(0);
  });

  it("returns 0 when position is negative (edge case)", () => {
    expect(scoreFromRank(-1, 5)).toBe(0);
  });
});

describe("scoreFromRank property tests", () => {
  it("is monotonically decreasing in rank position (lower position = higher score)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 1000 }),
        (total) => {
          let prevScore = scoreFromRank(1, total);
          for (let pos = 2; pos <= total; pos++) {
            const currentScore = scoreFromRank(pos, total);
            if (currentScore > prevScore) return false;
            prevScore = currentScore;
          }
          return true;
        }
      )
    );
  });

  it("is bounded [0, 10]", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10000 }),
        fc.integer({ min: 1, max: 10000 }),
        (position, total) => {
          const score = scoreFromRank(position, total);
          return score >= 0 && score <= 10;
        }
      )
    );
  });

  it("is never negative", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -100, max: 10000 }),
        fc.integer({ min: -100, max: 10000 }),
        (position, total) => {
          const score = scoreFromRank(position, total);
          return score >= 0;
        }
      )
    );
  });

  it("is never NaN", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -100, max: 10000 }),
        fc.integer({ min: -100, max: 10000 }),
        (position, total) => {
          const score = scoreFromRank(position, total);
          return !Number.isNaN(score);
        }
      )
    );
  });

  it("position 1 always yields the maximum score for that total", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10000 }),
        (total) => {
          const score = scoreFromRank(1, total);
          return score === 10;
        }
      )
    );
  });

  it("last position always yields 0 when total >= 2", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 10000 }),
        (total) => {
          const score = scoreFromRank(total, total);
          return score === 0;
        }
      )
    );
  });

  it("displays to at most 2 decimal places", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10000 }),
        fc.integer({ min: 1, max: 10000 }),
        (position, total) => {
          const score = scoreFromRank(position, total);
          const decimals = score.toString().split(".")[1];
          return decimals === undefined || decimals.length <= 2;
        }
      )
    );
  });
});

describe("SCORE_UNLOCK_THRESHOLD", () => {
  it("is 10", () => {
    expect(SCORE_UNLOCK_THRESHOLD).toBe(10);
  });
});

describe("isScoreUnlocked", () => {
  it("returns false when finishedCount is 0", () => {
    expect(isScoreUnlocked(0)).toBe(false);
  });

  it("returns false when finishedCount is 1", () => {
    expect(isScoreUnlocked(1)).toBe(false);
  });

  it("returns false when finishedCount is 9 (one below threshold)", () => {
    expect(isScoreUnlocked(9)).toBe(false);
  });

  it("returns true when finishedCount is exactly 10 (at threshold)", () => {
    expect(isScoreUnlocked(10)).toBe(true);
  });

  it("returns true when finishedCount is 11 (above threshold)", () => {
    expect(isScoreUnlocked(11)).toBe(true);
  });

  it("returns true when finishedCount is 100 (well above threshold)", () => {
    expect(isScoreUnlocked(100)).toBe(true);
  });

  it("returns false for negative counts", () => {
    expect(isScoreUnlocked(-1)).toBe(false);
  });
});

describe("isScoreUnlocked property tests", () => {
  it("is false for all counts below SCORE_UNLOCK_THRESHOLD", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: SCORE_UNLOCK_THRESHOLD - 1 }),
        (count) => {
          return isScoreUnlocked(count) === false;
        }
      )
    );
  });

  it("is true for all counts at or above SCORE_UNLOCK_THRESHOLD", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: SCORE_UNLOCK_THRESHOLD, max: 10000 }),
        (count) => {
          return isScoreUnlocked(count) === true;
        }
      )
    );
  });
});

describe("redactScore", () => {
  const now = new Date();

  function makeRanking(overrides?: Partial<Ranking>): Ranking {
    return {
      id: "00000000-0000-0000-0000-000000000001",
      profileId: "00000000-0000-0000-0000-000000000002",
      bookId: "00000000-0000-0000-0000-000000000003",
      position: 1,
      score: 8.5,
      bucket: 4,
      version: 1,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
  }

  it("returns ranking with original score when unlocked is true", () => {
    const ranking = makeRanking({ score: 7.25 });
    const result = redactScore(ranking, true);
    expect(result.score).toBe(7.25);
  });

  it("returns ranking with null score when unlocked is false", () => {
    const ranking = makeRanking({ score: 7.25 });
    const result = redactScore(ranking, false);
    expect(result.score).toBeNull();
  });

  it("preserves all non-score fields when redacting", () => {
    const ranking = makeRanking({ position: 3, bucket: 2 });
    const result = redactScore(ranking, false);
    expect(result.id).toBe(ranking.id);
    expect(result.profileId).toBe(ranking.profileId);
    expect(result.bookId).toBe(ranking.bookId);
    expect(result.position).toBe(3);
    expect(result.bucket).toBe(2);
    expect(result.version).toBe(ranking.version);
    expect(result.score).toBeNull();
  });

  it("preserves all non-score fields when not redacting", () => {
    const ranking = makeRanking({ position: 5, bucket: 1 });
    const result = redactScore(ranking, true);
    expect(result.id).toBe(ranking.id);
    expect(result.profileId).toBe(ranking.profileId);
    expect(result.bookId).toBe(ranking.bookId);
    expect(result.position).toBe(5);
    expect(result.bucket).toBe(1);
    expect(result.score).toBe(ranking.score);
  });

  it("returns the original ranking object reference when unlocked", () => {
    const ranking = makeRanking();
    const result = redactScore(ranking, true);
    expect(result).toBe(ranking);
  });

  it("returns a new object when redacting (does not mutate original)", () => {
    const ranking = makeRanking({ score: 9.0 });
    const result = redactScore(ranking, false);
    expect(result).not.toBe(ranking);
    expect(ranking.score).toBe(9.0);
  });
});
