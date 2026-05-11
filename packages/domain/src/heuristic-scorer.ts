/**
 * Heuristic scorer (weighted-sum) for book recommendations.
 *
 * Per PRD Q16d, signals: mutual_count, mutual_avg_score, taste_overlap (cosine),
 * genre_match, recency, popularity_floor.
 *
 * Each rec carries a one-line "why this?" picked from the dominant signal.
 *
 * Pure function — no I/O, no ports. The caller is responsible for gathering
 * the raw signal values; this module only combines them.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Names of the six scoring signals. */
export type SignalName =
  | "mutual_count"
  | "mutual_avg_score"
  | "taste_overlap"
  | "genre_match"
  | "recency"
  | "popularity_floor";

/** Raw signal values that the caller must provide. */
export interface CandidateSignals {
  /** Number of viewer's mutuals who finished this book (>= 0). */
  mutualCount: number;
  /** Average score mutuals gave this book (0-10 scale, or null if none). */
  mutualAvgScore: number | null;
  /** Cosine similarity between viewer's taste vector and the candidate's taste vector [0, 1]. */
  tasteOverlap: number;
  /** Fraction of viewer's top genres that overlap with the book's genres [0, 1]. */
  genreMatch: number;
  /** Recency factor — 1.0 for books finished today by a mutual, decaying toward 0 for older finishes. */
  recency: number;
  /** Popularity floor — total number of users who have finished this book (>= 0). */
  popularityFloor: number;
}

/** Output of the scorer. */
export interface ScoredCandidate {
  /** Final weighted score in [0, 1]. */
  score: number;
  /** The signal that contributed the most to the final score. */
  dominantSignal: SignalName;
}

/** Per-signal weight configuration. */
export interface ScorerWeights {
  mutualCount: number;
  mutualAvgScore: number;
  tasteOverlap: number;
  genreMatch: number;
  recency: number;
  popularityFloor: number;
}

// ---------------------------------------------------------------------------
// Defaults — hand-tuned starting weights
// ---------------------------------------------------------------------------

/**
 * Hand-tuned starting weights.
 *
 * Rationale:
 *   - mutual_count (0.30): strongest social proof; friends finished it.
 *   - mutual_avg_score (0.25): quality signal from trusted circle.
 *   - taste_overlap (0.20): algorithmic affinity based on shared rankings.
 *   - genre_match (0.10): lightweight content signal; lower weight because
 *     genre metadata can be noisy.
 *   - recency (0.10): freshness bias; keeps recs from going stale.
 *   - popularity_floor (0.05): prevents surfacing ultra-niche books nobody
 *     has heard of; intentionally small so it doesn't drown out social signals.
 */
export const DEFAULT_WEIGHTS: ScorerWeights = {
  mutualCount: 0.30,
  mutualAvgScore: 0.25,
  tasteOverlap: 0.20,
  genreMatch: 0.10,
  recency: 0.10,
  popularityFloor: 0.05,
};

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

/**
 * Normalize mutual count to [0, 1] using a saturating curve.
 * 5+ mutuals finishing a book maps to 1.0.
 */
const MUTUAL_COUNT_SATURATION = 5;

function normalizeMutualCount(count: number): number {
  if (count <= 0) return 0;
  return Math.min(count / MUTUAL_COUNT_SATURATION, 1);
}

/**
 * Normalize mutual average score (0-10) to [0, 1].
 * Null (no mutual scores) maps to 0.
 */
function normalizeMutualAvgScore(avg: number | null): number {
  if (avg === null) return 0;
  return Math.max(0, Math.min(avg / 10, 1));
}

/**
 * Normalize popularity floor to [0, 1] using a saturating curve.
 * 50+ total finishes maps to 1.0.
 */
const POPULARITY_SATURATION = 50;

function normalizePopularityFloor(count: number): number {
  if (count <= 0) return 0;
  return Math.min(count / POPULARITY_SATURATION, 1);
}

// ---------------------------------------------------------------------------
// Human-readable reason mapping
// ---------------------------------------------------------------------------

const SIGNAL_REASONS: Record<SignalName, string> = {
  mutual_count: "Popular among your friends",
  mutual_avg_score: "Highly rated by your friends",
  taste_overlap: "Matches your reading taste",
  genre_match: "Fits your favorite genres",
  recency: "Recently read by your friends",
  popularity_floor: "Widely read on Hone",
};

/**
 * Return the one-line "why this?" string for a dominant signal.
 */
export function reasonForSignal(signal: SignalName): string {
  return SIGNAL_REASONS[signal];
}

// ---------------------------------------------------------------------------
// Core scorer
// ---------------------------------------------------------------------------

/**
 * Score a candidate book using a weighted sum of normalized signals.
 *
 * All input signals are normalized to [0, 1] internally. The final score
 * is the dot product of normalized signals and weights, divided by the
 * sum of weights (so the output is in [0, 1] regardless of weight scale).
 *
 * @param signals - Raw signal values for one candidate book.
 * @param weights - Per-signal weights. Defaults to `DEFAULT_WEIGHTS`.
 * @returns Scored candidate with the final score and dominant signal.
 */
export function scoreCandidate(
  signals: CandidateSignals,
  weights: ScorerWeights = DEFAULT_WEIGHTS,
): ScoredCandidate {
  // Normalize all signals to [0, 1]
  const normalized: Record<SignalName, number> = {
    mutual_count: normalizeMutualCount(signals.mutualCount),
    mutual_avg_score: normalizeMutualAvgScore(signals.mutualAvgScore),
    taste_overlap: Math.max(0, Math.min(signals.tasteOverlap, 1)),
    genre_match: Math.max(0, Math.min(signals.genreMatch, 1)),
    recency: Math.max(0, Math.min(signals.recency, 1)),
    popularity_floor: normalizePopularityFloor(signals.popularityFloor),
  };

  // Pair each signal with its weight
  const weightMap: Record<SignalName, number> = {
    mutual_count: weights.mutualCount,
    mutual_avg_score: weights.mutualAvgScore,
    taste_overlap: weights.tasteOverlap,
    genre_match: weights.genreMatch,
    recency: weights.recency,
    popularity_floor: weights.popularityFloor,
  };

  const signalNames: SignalName[] = [
    "mutual_count",
    "mutual_avg_score",
    "taste_overlap",
    "genre_match",
    "recency",
    "popularity_floor",
  ];

  // Weighted sum
  let weightedSum = 0;
  let totalWeight = 0;
  for (const name of signalNames) {
    const w = weightMap[name];
    weightedSum += normalized[name] * w;
    totalWeight += w;
  }

  // Normalize to [0, 1]
  const score = totalWeight > 0
    ? Math.round((weightedSum / totalWeight) * 10000) / 10000
    : 0;

  // Find dominant signal: the one contributing the most to the weighted sum
  let dominantSignal: SignalName = "mutual_count";
  let maxContribution = -1;
  for (const name of signalNames) {
    const contribution = normalized[name] * weightMap[name];
    if (contribution > maxContribution) {
      maxContribution = contribution;
      dominantSignal = name;
    }
  }

  return { score, dominantSignal };
}
