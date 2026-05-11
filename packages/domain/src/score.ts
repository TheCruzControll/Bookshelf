/**
 * Score derivation from rank position.
 *
 * Rank order is the source of truth. The score is a projection of that order
 * onto the [0, 10] range, displayed to 2 decimal places.
 *
 * V1 uses a simple linear interpolation: the top-ranked book gets 10.00,
 * the bottom-ranked book gets 0.00, and everything in between is evenly spaced.
 *
 * When there is only one ranked book, it receives a score of 10.00.
 */

import type { Ranking } from "./types";

/**
 * Derive a 0-10 score from a 1-based rank position within a total count of ranked books.
 *
 * @param position - 1-based rank position (1 = best)
 * @param total - total number of ranked books (must be >= 1)
 * @returns score in [0, 10] rounded to 2 decimal places
 */
export function scoreFromRank(position: number, total: number): number {
  if (total <= 0 || position <= 0) {
    return 0;
  }

  if (total === 1) {
    return 10;
  }

  // Position 1 = highest score (10), position total = lowest score (0)
  const raw = ((total - position) / (total - 1)) * 10;

  // Clamp to [0, 10] to handle edge cases, then round to 2 decimal places
  const clamped = Math.max(0, Math.min(10, raw));
  return Math.round(clamped * 100) / 100;
}

/**
 * Score-unlock threshold.
 *
 * Users must rank at least this many books before their scores become visible
 * on all read surfaces (profile ranked list, feed events, etc.).
 */
export const SCORE_UNLOCK_THRESHOLD = 10;

/**
 * Determine whether a user's scores are unlocked based on their finished
 * (ranked) book count.
 *
 * @param finishedCount - number of books the user has ranked
 * @returns true when scores should be visible
 */
export function isScoreUnlocked(finishedCount: number): boolean {
  return finishedCount >= SCORE_UNLOCK_THRESHOLD;
}

/**
 * A ranking with its score potentially redacted.
 * When scores are locked, the `score` field is null.
 */
export type GatedRanking = Omit<Ranking, "score"> & { score: number | null };

/**
 * Redact the score from a ranking if scores are not unlocked.
 *
 * @param ranking - the ranking to potentially redact
 * @param unlocked - whether the user's scores are unlocked
 * @returns a copy with score nulled when locked
 */
export function redactScore(ranking: Ranking, unlocked: boolean): GatedRanking {
  if (unlocked) {
    return ranking;
  }
  return { ...ranking, score: null };
}
