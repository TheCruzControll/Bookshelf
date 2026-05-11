/**
 * Candidate query for the recommendation engine.
 *
 * Fetches the Top-K candidate book set for a viewer by combining three
 * candidate sources:
 *   1. Popular — globally popular books on Hone (finished count)
 *   2. Followed-network — books finished by people the viewer follows
 *   3. Genre overlap — books matching the viewer's top genres
 *
 * All sources are merged, deduplicated, and filtered:
 *   - Exclude books the viewer has already finished
 *   - Exclude books sourced solely from blocked users
 *
 * The output is a list of `CandidateBook` objects ready to be scored by
 * the heuristic scorer (P-01, #128).
 */

import type { EntityId } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A candidate book returned from the query, ready for scoring. */
export interface CandidateBook {
  bookId: EntityId;
  /** Number of the viewer's followed users who finished this book. */
  networkFinishedCount: number;
  /** Total number of users who finished this book on the platform. */
  popularityCount: number;
  /** Genres associated with this book. */
  genres: string[];
}

/** Input for the candidate query. */
export interface CandidateQueryInput {
  /** The viewer requesting recommendations. */
  viewerId: EntityId;
  /** Maximum number of candidates to return. */
  limit: number;
}

// ---------------------------------------------------------------------------
// Port — implemented by the data layer
// ---------------------------------------------------------------------------

/** Port that the data layer must implement to supply candidate data. */
export interface CandidateQueryPort {
  /**
   * Return popular books on the platform (by finished count),
   * excluding the given bookIds and limited to `limit`.
   */
  getPopularBooks(input: {
    excludeBookIds: Set<EntityId>;
    limit: number;
  }): Promise<CandidateBook[]>;

  /**
   * Return books finished by users the viewer follows,
   * excluding the given bookIds, limited to `limit`.
   * Must exclude contributions from blocked users.
   */
  getNetworkBooks(input: {
    viewerId: EntityId;
    excludeBookIds: Set<EntityId>;
    excludeUserIds: Set<EntityId>;
    limit: number;
  }): Promise<CandidateBook[]>;

  /**
   * Return books that overlap with the viewer's top genres,
   * excluding the given bookIds, limited to `limit`.
   */
  getGenreOverlapBooks(input: {
    viewerGenres: string[];
    excludeBookIds: Set<EntityId>;
    limit: number;
  }): Promise<CandidateBook[]>;

  /**
   * Get the set of book IDs the viewer has already finished.
   */
  getFinishedBookIds(viewerId: EntityId): Promise<Set<EntityId>>;

  /**
   * Get the set of user IDs blocked by or blocking the viewer.
   */
  getBlockedUserIds(viewerId: EntityId): Promise<Set<EntityId>>;

  /**
   * Get the viewer's top genres based on their finished books.
   */
  getViewerTopGenres(viewerId: EntityId, limit: number): Promise<string[]>;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/** Default number of top genres to use for genre overlap. */
const DEFAULT_GENRE_LIMIT = 5;

/**
 * Merge candidates from multiple sources, deduplicating by bookId.
 * When the same book appears in multiple sources, their counts are merged
 * (max of each count is kept).
 */
function mergeCandidates(sources: CandidateBook[][]): Map<EntityId, CandidateBook> {
  const merged = new Map<EntityId, CandidateBook>();

  for (const source of sources) {
    for (const candidate of source) {
      const existing = merged.get(candidate.bookId);
      if (existing) {
        // Merge: keep the higher counts and union genres
        merged.set(candidate.bookId, {
          bookId: candidate.bookId,
          networkFinishedCount: Math.max(
            existing.networkFinishedCount,
            candidate.networkFinishedCount
          ),
          popularityCount: Math.max(
            existing.popularityCount,
            candidate.popularityCount
          ),
          genres: [...new Set([...existing.genres, ...candidate.genres])],
        });
      } else {
        merged.set(candidate.bookId, { ...candidate });
      }
    }
  }

  return merged;
}

/**
 * Rank candidates by a simple composite score:
 *   networkFinishedCount * 2 + popularityCount
 * This ensures social signal is weighted higher than raw popularity.
 */
function rankCandidates(candidates: CandidateBook[]): CandidateBook[] {
  return [...candidates].sort((a, b) => {
    const scoreA = a.networkFinishedCount * 2 + a.popularityCount;
    const scoreB = b.networkFinishedCount * 2 + b.popularityCount;
    return scoreB - scoreA;
  });
}

/**
 * Fetch the top-K recommendation candidates for a viewer.
 *
 * Combines popular, network, and genre-overlap sources, deduplicates,
 * excludes already-finished books and blocked users, then returns
 * the top candidates ranked by composite relevance.
 */
export async function queryCandidates(
  port: CandidateQueryPort,
  input: CandidateQueryInput
): Promise<CandidateBook[]> {
  const { viewerId, limit } = input;

  // Step 1: Get exclusion sets
  const [finishedBookIds, blockedUserIds, viewerGenres] = await Promise.all([
    port.getFinishedBookIds(viewerId),
    port.getBlockedUserIds(viewerId),
    port.getViewerTopGenres(viewerId, DEFAULT_GENRE_LIMIT),
  ]);

  // Step 2: Fetch candidates from all three sources in parallel
  // Request more than `limit` from each source to allow for dedup
  const fetchLimit = limit * 2;

  const [popular, network, genreOverlap] = await Promise.all([
    port.getPopularBooks({
      excludeBookIds: finishedBookIds,
      limit: fetchLimit,
    }),
    port.getNetworkBooks({
      viewerId,
      excludeBookIds: finishedBookIds,
      excludeUserIds: blockedUserIds,
      limit: fetchLimit,
    }),
    viewerGenres.length > 0
      ? port.getGenreOverlapBooks({
          viewerGenres,
          excludeBookIds: finishedBookIds,
          limit: fetchLimit,
        })
      : Promise.resolve([]),
  ]);

  // Step 3: Merge, deduplicate, rank, and trim to limit
  const merged = mergeCandidates([popular, network, genreOverlap]);
  const ranked = rankCandidates([...merged.values()]);

  return ranked.slice(0, limit);
}
