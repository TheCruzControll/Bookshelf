import { describe, it, expect, vi } from "vitest";
import { publishActivityEvent } from "./activity-publisher";
import type { ActivityRepository, RankingRepository } from "./ports";
import type { Ranking } from "./types";

function makeActivity(overrides?: Partial<ActivityRepository>): ActivityRepository {
  return {
    append: vi.fn().mockImplementation(async (input) => ({
      id: "evt-1",
      ...input,
      occurredAt: new Date(),
    })),
    getFriendFeed: vi.fn(),
    deleteByReviewId: vi.fn(),
    ...overrides,
  };
}

function makeRankings(overrides?: Partial<RankingRepository>): RankingRepository {
  return {
    upsert: vi.fn(),
    findById: vi.fn(),
    findByOwnerAndBook: vi.fn(),
    listByOwner: vi.fn().mockResolvedValue([]),
    delete: vi.fn(),
    startBucket: vi.fn(),
    ...overrides,
  };
}

function makeRanking(overrides?: Partial<Ranking>): Ranking {
  const now = new Date();
  return {
    id: "ranking-1",
    profileId: "user-1",
    bookId: "book-1",
    position: 3,
    score: 7.5,
    bucket: 4,
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("publishActivityEvent", () => {
  it("appends a simple event without score snapshot when neither scoreSnapshot nor requiresRanking is set", async () => {
    const activity = makeActivity();

    const result = await publishActivityEvent(activity, null, {
      actorId: "user-1",
      verb: "book_added",
      bookId: "book-1",
      shelfId: "shelf-1",
      visibility: "followers",
    });

    expect(result).not.toBeNull();
    expect(activity.append).toHaveBeenCalledWith({
      actorId: "user-1",
      verb: "book_added",
      bookId: "book-1",
      shelfId: "shelf-1",
      reviewId: undefined,
      visibility: "followers",
      scoreAtPublish: undefined,
      scoreLockedAtPublish: undefined,
    });
  });

  it("populates score snapshot from caller-provided scoreSnapshot", async () => {
    const activity = makeActivity();

    const result = await publishActivityEvent(activity, null, {
      actorId: "user-1",
      verb: "book_finished",
      bookId: "book-1",
      visibility: "followers",
      scoreSnapshot: { score: 8.25, locked: false },
    });

    expect(result).not.toBeNull();
    expect(activity.append).toHaveBeenCalledWith(
      expect.objectContaining({
        scoreAtPublish: 8.25,
        scoreLockedAtPublish: false,
      }),
    );
  });

  it("populates score snapshot from ranking lookup when requiresRanking is true", async () => {
    const ranking = makeRanking({ score: 6.0 });
    // 12 rankings means scores are unlocked (>= 10)
    const allRankings = Array.from({ length: 12 }, (_, i) =>
      makeRanking({ id: `r-${i}`, position: i + 1 }),
    );

    const rankings = makeRankings({
      findByOwnerAndBook: vi.fn().mockResolvedValue(ranking),
      listByOwner: vi.fn().mockResolvedValue(allRankings),
    });
    const activity = makeActivity();

    const result = await publishActivityEvent(activity, rankings, {
      actorId: "user-1",
      verb: "book_ranked",
      bookId: "book-1",
      visibility: "followers",
      requiresRanking: true,
    });

    expect(result).not.toBeNull();
    expect(rankings.findByOwnerAndBook).toHaveBeenCalledWith({
      ownerId: "user-1",
      bookId: "book-1",
    });
    expect(activity.append).toHaveBeenCalledWith(
      expect.objectContaining({
        scoreAtPublish: 6.0,
        scoreLockedAtPublish: false, // 12 >= 10 => unlocked => locked=false
      }),
    );
  });

  it("sets scoreLockedAtPublish=true when user has fewer than 10 rankings", async () => {
    const ranking = makeRanking({ score: 10 });
    // 5 rankings means scores are locked (< 10)
    const fewRankings = Array.from({ length: 5 }, (_, i) =>
      makeRanking({ id: `r-${i}`, position: i + 1 }),
    );

    const rankings = makeRankings({
      findByOwnerAndBook: vi.fn().mockResolvedValue(ranking),
      listByOwner: vi.fn().mockResolvedValue(fewRankings),
    });
    const activity = makeActivity();

    const result = await publishActivityEvent(activity, rankings, {
      actorId: "user-1",
      verb: "book_ranked",
      bookId: "book-1",
      visibility: "followers",
      requiresRanking: true,
    });

    expect(result).not.toBeNull();
    expect(activity.append).toHaveBeenCalledWith(
      expect.objectContaining({
        scoreAtPublish: 10,
        scoreLockedAtPublish: true, // 5 < 10 => locked
      }),
    );
  });

  it("returns null and does not emit event for unfinished ranking flow (no ranking found)", async () => {
    const rankings = makeRankings({
      findByOwnerAndBook: vi.fn().mockResolvedValue(null),
    });
    const activity = makeActivity();

    const result = await publishActivityEvent(activity, rankings, {
      actorId: "user-1",
      verb: "book_finished",
      bookId: "book-1",
      visibility: "followers",
      requiresRanking: true,
    });

    expect(result).toBeNull();
    expect(activity.append).not.toHaveBeenCalled();
  });

  it("throws when requiresRanking is true but no RankingRepository is provided", async () => {
    const activity = makeActivity();

    await expect(
      publishActivityEvent(activity, null, {
        actorId: "user-1",
        verb: "book_ranked",
        bookId: "book-1",
        visibility: "followers",
        requiresRanking: true,
      }),
    ).rejects.toThrow("requiresRanking is true but no RankingRepository was provided");
  });

  it("scoreSnapshot takes precedence — no ranking lookup performed", async () => {
    const rankings = makeRankings();
    const activity = makeActivity();

    await publishActivityEvent(activity, rankings, {
      actorId: "user-1",
      verb: "book_finished",
      bookId: "book-1",
      visibility: "followers",
      scoreSnapshot: { score: 9.0, locked: true },
      requiresRanking: true,
    });

    // When scoreSnapshot is provided, ranking lookup is skipped
    expect(rankings.findByOwnerAndBook).not.toHaveBeenCalled();
    expect(activity.append).toHaveBeenCalledWith(
      expect.objectContaining({
        scoreAtPublish: 9.0,
        scoreLockedAtPublish: true,
      }),
    );
  });

  it("passes through optional fields (shelfId, reviewId, bookId)", async () => {
    const activity = makeActivity();

    await publishActivityEvent(activity, null, {
      actorId: "user-1",
      verb: "book_reviewed",
      bookId: "book-1",
      reviewId: "review-1",
      visibility: "public",
    });

    expect(activity.append).toHaveBeenCalledWith(
      expect.objectContaining({
        bookId: "book-1",
        reviewId: "review-1",
        shelfId: undefined,
      }),
    );
  });

  it("works for list publish (shelf_updated verb, no ranking needed)", async () => {
    const activity = makeActivity();

    const result = await publishActivityEvent(activity, null, {
      actorId: "user-1",
      verb: "shelf_updated",
      shelfId: "list-1",
      visibility: "public",
    });

    expect(result).not.toBeNull();
    expect(activity.append).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "user-1",
        verb: "shelf_updated",
        shelfId: "list-1",
        scoreAtPublish: undefined,
        scoreLockedAtPublish: undefined,
      }),
    );
  });

  it("works for status change events (book_started)", async () => {
    const activity = makeActivity();

    const result = await publishActivityEvent(activity, null, {
      actorId: "user-1",
      verb: "book_started",
      bookId: "book-1",
      visibility: "followers",
    });

    expect(result).not.toBeNull();
    expect(result!.verb).toBe("book_started");
  });

  it("works for status change events (book_dropped)", async () => {
    const activity = makeActivity();

    const result = await publishActivityEvent(activity, null, {
      actorId: "user-1",
      verb: "book_dropped",
      bookId: "book-1",
      visibility: "followers",
    });

    expect(result).not.toBeNull();
    expect(result!.verb).toBe("book_dropped");
  });
});
