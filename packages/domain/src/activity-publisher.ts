/**
 * Activity event publisher with score snapshot.
 *
 * Centralises the logic for appending activity events so that every
 * call-site (ranking, status changes, list publish) gets:
 *
 * 1. Correct score-at-publish and score-locked-at-publish values drawn
 *    from the user's current ranking state.
 * 2. Group-key computation delegated to ActivityRepository.append.
 * 3. Guard against emitting events for unfinished ranking flows —
 *    if a ranking flow is incomplete the publisher returns null.
 */

import type { ActivityRepository, RankingRepository } from "./ports";
import type { ActivityEvent, ActivityVerb, EntityId, Visibility } from "./types";
import { isScoreUnlocked } from "./score";

export interface PublishActivityEventInput {
  actorId: EntityId;
  verb: ActivityVerb;
  bookId?: EntityId | undefined;
  shelfId?: EntityId | undefined;
  reviewId?: EntityId | undefined;
  visibility: Visibility;
  /**
   * When true the publisher will look up the actor's ranking for the given
   * bookId and freeze the score into the event.  If no ranking exists yet
   * (unfinished flow) the event is **not** emitted and the helper returns
   * null.
   *
   * Requires a non-null `rankings` parameter.
   */
  requiresRanking?: boolean;
  /**
   * Provide a pre-computed score + lock state when the caller already knows
   * the values (e.g. RankingService.finishBook has just computed them).
   * When supplied, the publisher skips the ranking lookup.
   */
  scoreSnapshot?: {
    score: number;
    locked: boolean;
  };
}

/**
 * Publish an activity event, optionally enriched with a frozen score
 * snapshot from the actor's ranking state.
 *
 * @param activity  - the activity repository used to persist the event
 * @param rankings  - the ranking repository; may be null when the caller
 *                    knows no ranking lookup is needed (i.e. neither
 *                    `requiresRanking` nor `scoreSnapshot` uses it)
 * @param input     - event fields plus optional score-snapshot directives
 *
 * @returns the persisted ActivityEvent, or `null` when `requiresRanking`
 *          is true but no ranking exists for the given book (unfinished
 *          ranking flow guard).
 */
export async function publishActivityEvent(
  activity: ActivityRepository,
  rankings: RankingRepository | null,
  input: PublishActivityEventInput,
): Promise<ActivityEvent | null> {
  let scoreAtPublish: number | undefined;
  let scoreLockedAtPublish: boolean | undefined;

  if (input.scoreSnapshot) {
    // Caller provided the snapshot — trust it (avoids double lookup).
    scoreAtPublish = input.scoreSnapshot.score;
    scoreLockedAtPublish = input.scoreSnapshot.locked;
  } else if (input.requiresRanking && input.bookId) {
    if (!rankings) {
      throw new Error(
        "publishActivityEvent: requiresRanking is true but no RankingRepository was provided",
      );
    }

    // Look up the actor's ranking for this book.
    const ranking = await rankings.findByOwnerAndBook({
      ownerId: input.actorId,
      bookId: input.bookId,
    });

    if (!ranking) {
      // Unfinished ranking flow — do not emit an event.
      return null;
    }

    const allRankings = await rankings.listByOwner(input.actorId);
    const unlocked = isScoreUnlocked(allRankings.length);

    scoreAtPublish = ranking.score;
    scoreLockedAtPublish = !unlocked;
  }

  const event = await activity.append({
    actorId: input.actorId,
    verb: input.verb,
    bookId: input.bookId,
    shelfId: input.shelfId,
    reviewId: input.reviewId,
    visibility: input.visibility,
    scoreAtPublish,
    scoreLockedAtPublish,
  });

  return event;
}
