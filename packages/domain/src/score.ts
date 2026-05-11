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
