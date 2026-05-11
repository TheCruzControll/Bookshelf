import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { scoreFromRank } from "./score";

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
