import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  scoreCandidate,
  reasonForSignal,
  DEFAULT_WEIGHTS,
} from "./heuristic-scorer";
import type {
  CandidateSignals,
  SignalName,
  ScorerWeights,
} from "./heuristic-scorer";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSignals(overrides: Partial<CandidateSignals> = {}): CandidateSignals {
  return {
    mutualCount: 0,
    mutualAvgScore: null,
    tasteOverlap: 0,
    genreMatch: 0,
    recency: 0,
    popularityFloor: 0,
    ...overrides,
  };
}

const ALL_SIGNAL_NAMES: SignalName[] = [
  "mutual_count",
  "mutual_avg_score",
  "taste_overlap",
  "genre_match",
  "recency",
  "popularity_floor",
];

// ---------------------------------------------------------------------------
// scoreCandidate — unit tests
// ---------------------------------------------------------------------------

describe("scoreCandidate", () => {
  it("returns { score: 0, dominantSignal } when all signals are zero", () => {
    const result = scoreCandidate(makeSignals());
    expect(result.score).toBe(0);
    expect(ALL_SIGNAL_NAMES).toContain(result.dominantSignal);
  });

  it("returns score 1 when all signals are at maximum", () => {
    const result = scoreCandidate(makeSignals({
      mutualCount: 5,
      mutualAvgScore: 10,
      tasteOverlap: 1,
      genreMatch: 1,
      recency: 1,
      popularityFloor: 50,
    }));
    expect(result.score).toBe(1);
  });

  it("dominant signal is mutual_count when only mutual_count is nonzero", () => {
    const result = scoreCandidate(makeSignals({ mutualCount: 3 }));
    expect(result.dominantSignal).toBe("mutual_count");
    expect(result.score).toBeGreaterThan(0);
  });

  it("dominant signal is mutual_avg_score when only mutual_avg_score is nonzero", () => {
    const result = scoreCandidate(makeSignals({ mutualAvgScore: 8 }));
    expect(result.dominantSignal).toBe("mutual_avg_score");
    expect(result.score).toBeGreaterThan(0);
  });

  it("dominant signal is taste_overlap when only taste_overlap is nonzero", () => {
    const result = scoreCandidate(makeSignals({ tasteOverlap: 0.9 }));
    expect(result.dominantSignal).toBe("taste_overlap");
    expect(result.score).toBeGreaterThan(0);
  });

  it("dominant signal is genre_match when only genre_match is nonzero", () => {
    const result = scoreCandidate(makeSignals({ genreMatch: 0.8 }));
    expect(result.dominantSignal).toBe("genre_match");
    expect(result.score).toBeGreaterThan(0);
  });

  it("dominant signal is recency when only recency is nonzero", () => {
    const result = scoreCandidate(makeSignals({ recency: 1.0 }));
    expect(result.dominantSignal).toBe("recency");
    expect(result.score).toBeGreaterThan(0);
  });

  it("dominant signal is popularity_floor when only popularity_floor is nonzero", () => {
    const result = scoreCandidate(makeSignals({ popularityFloor: 50 }));
    expect(result.dominantSignal).toBe("popularity_floor");
    expect(result.score).toBeGreaterThan(0);
  });

  it("mutual_count saturates at 5 — count of 10 equals count of 5", () => {
    const at5 = scoreCandidate(makeSignals({ mutualCount: 5 }));
    const at10 = scoreCandidate(makeSignals({ mutualCount: 10 }));
    expect(at5.score).toBe(at10.score);
  });

  it("popularity_floor saturates at 50", () => {
    const at50 = scoreCandidate(makeSignals({ popularityFloor: 50 }));
    const at200 = scoreCandidate(makeSignals({ popularityFloor: 200 }));
    expect(at50.score).toBe(at200.score);
  });

  it("null mutualAvgScore contributes 0 to the score", () => {
    const withNull = scoreCandidate(makeSignals({ mutualAvgScore: null }));
    const withZero = scoreCandidate(makeSignals({ mutualAvgScore: 0 }));
    expect(withNull.score).toBe(withZero.score);
  });

  it("higher mutual_count produces a higher score", () => {
    const low = scoreCandidate(makeSignals({ mutualCount: 1 }));
    const high = scoreCandidate(makeSignals({ mutualCount: 4 }));
    expect(high.score).toBeGreaterThan(low.score);
  });

  it("higher mutual_avg_score produces a higher score", () => {
    const low = scoreCandidate(makeSignals({ mutualAvgScore: 2 }));
    const high = scoreCandidate(makeSignals({ mutualAvgScore: 9 }));
    expect(high.score).toBeGreaterThan(low.score);
  });

  it("accepts custom weights", () => {
    const customWeights: ScorerWeights = {
      mutualCount: 1,
      mutualAvgScore: 0,
      tasteOverlap: 0,
      genreMatch: 0,
      recency: 0,
      popularityFloor: 0,
    };
    const result = scoreCandidate(
      makeSignals({ mutualCount: 5, tasteOverlap: 1 }),
      customWeights,
    );
    // Only mutual_count is weighted, so score = normalized mutual_count = 1.0
    expect(result.score).toBe(1);
    expect(result.dominantSignal).toBe("mutual_count");
  });

  it("returns 0 when all weights are 0", () => {
    const zeroWeights: ScorerWeights = {
      mutualCount: 0,
      mutualAvgScore: 0,
      tasteOverlap: 0,
      genreMatch: 0,
      recency: 0,
      popularityFloor: 0,
    };
    const result = scoreCandidate(
      makeSignals({ mutualCount: 5, tasteOverlap: 1 }),
      zeroWeights,
    );
    expect(result.score).toBe(0);
  });

  it("clamps negative signal values to 0", () => {
    const result = scoreCandidate(makeSignals({
      mutualCount: -5,
      tasteOverlap: -0.5,
      genreMatch: -1,
      recency: -0.3,
      popularityFloor: -10,
    }));
    expect(result.score).toBe(0);
  });

  it("clamps signals above their natural maximum to 1", () => {
    const result = scoreCandidate(makeSignals({
      tasteOverlap: 2.0,
      genreMatch: 5.0,
      recency: 10.0,
    }));
    // All three should be clamped to 1.0
    const expected = scoreCandidate(makeSignals({
      tasteOverlap: 1.0,
      genreMatch: 1.0,
      recency: 1.0,
    }));
    expect(result.score).toBe(expected.score);
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_WEIGHTS
// ---------------------------------------------------------------------------

describe("DEFAULT_WEIGHTS", () => {
  it("sums to 1.0", () => {
    const sum =
      DEFAULT_WEIGHTS.mutualCount +
      DEFAULT_WEIGHTS.mutualAvgScore +
      DEFAULT_WEIGHTS.tasteOverlap +
      DEFAULT_WEIGHTS.genreMatch +
      DEFAULT_WEIGHTS.recency +
      DEFAULT_WEIGHTS.popularityFloor;
    expect(sum).toBeCloseTo(1.0, 10);
  });

  it("all weights are positive", () => {
    for (const key of Object.keys(DEFAULT_WEIGHTS) as Array<keyof ScorerWeights>) {
      expect(DEFAULT_WEIGHTS[key]).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// reasonForSignal
// ---------------------------------------------------------------------------

describe("reasonForSignal", () => {
  it.each(ALL_SIGNAL_NAMES)("returns a non-empty string for %s", (signal) => {
    const reason = reasonForSignal(signal);
    expect(typeof reason).toBe("string");
    expect(reason.length).toBeGreaterThan(0);
  });

  it("returns distinct reasons for each signal", () => {
    const reasons = ALL_SIGNAL_NAMES.map(reasonForSignal);
    expect(new Set(reasons).size).toBe(ALL_SIGNAL_NAMES.length);
  });
});

// ---------------------------------------------------------------------------
// scoreCandidate — property-based tests
// ---------------------------------------------------------------------------

describe("scoreCandidate property tests", () => {
  const signalsArb = fc.record({
    mutualCount: fc.integer({ min: 0, max: 20 }),
    mutualAvgScore: fc.oneof(
      fc.constant(null as number | null),
      fc.float({ min: 0, max: 10, noNaN: true }),
    ),
    tasteOverlap: fc.float({ min: 0, max: 1, noNaN: true }),
    genreMatch: fc.float({ min: 0, max: 1, noNaN: true }),
    recency: fc.float({ min: 0, max: 1, noNaN: true }),
    popularityFloor: fc.integer({ min: 0, max: 200 }),
  });

  it("score is always in [0, 1]", () => {
    fc.assert(
      fc.property(signalsArb, (signals) => {
        const { score } = scoreCandidate(signals);
        return score >= 0 && score <= 1;
      }),
    );
  });

  it("score is never NaN", () => {
    fc.assert(
      fc.property(signalsArb, (signals) => {
        const { score } = scoreCandidate(signals);
        return !Number.isNaN(score);
      }),
    );
  });

  it("dominantSignal is always a valid SignalName", () => {
    fc.assert(
      fc.property(signalsArb, (signals) => {
        const { dominantSignal } = scoreCandidate(signals);
        return ALL_SIGNAL_NAMES.includes(dominantSignal);
      }),
    );
  });

  it("increasing any signal never decreases the score", () => {
    fc.assert(
      fc.property(
        signalsArb,
        fc.constantFrom<keyof CandidateSignals>(
          "mutualCount",
          "tasteOverlap",
          "genreMatch",
          "recency",
          "popularityFloor",
        ),
        fc.float({ min: Math.fround(0.01), max: Math.fround(5), noNaN: true }),
        (signals, field, bump) => {
          const baseline = scoreCandidate(signals).score;
          const boosted = { ...signals, [field]: (signals[field] as number) + bump };
          const after = scoreCandidate(boosted).score;
          return after >= baseline - 0.0001; // tolerance for float rounding
        },
      ),
    );
  });

  it("score is monotonically non-decreasing in mutualAvgScore", () => {
    fc.assert(
      fc.property(
        signalsArb,
        fc.float({ min: Math.fround(0.1), max: Math.fround(10), noNaN: true }),
        (signals, avgScore) => {
          const base = { ...signals, mutualAvgScore: 0 };
          const higher = { ...signals, mutualAvgScore: avgScore };
          return scoreCandidate(higher).score >= scoreCandidate(base).score - 0.0001;
        },
      ),
    );
  });

  it("is deterministic — same inputs yield same outputs", () => {
    fc.assert(
      fc.property(signalsArb, (signals) => {
        const a = scoreCandidate(signals);
        const b = scoreCandidate(signals);
        return a.score === b.score && a.dominantSignal === b.dominantSignal;
      }),
    );
  });
});
