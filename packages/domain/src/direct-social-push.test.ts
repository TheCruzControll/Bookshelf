/**
 * Tests for the four Q-04 direct-social push triggers (#148).
 *
 * For each trigger we verify:
 *   - the trigger fires + the push is enqueued (in-app row created)
 *   - quiet hours, when active, block delivery (and skip the in-app row)
 *
 * Repository fakes follow the same shape used in `services.test.ts`.
 */

import { describe, it, expect, vi } from "vitest";
import { FollowService, NotificationService, RankingService } from "./services";
import type {
  ActivityRepository,
  BlockRepository,
  FollowRepository,
  InAppNotificationRepository,
  NotificationRepository,
  RankingRepository,
  ShelfRepository,
} from "./ports";
import type { Follow } from "./types";

const ACTOR = "00000000-0000-0000-0000-0000000000a1";
const RECIPIENT = "00000000-0000-0000-0000-0000000000a2";
const MUTUAL_A = "00000000-0000-0000-0000-0000000000a3";
const BOOK = "00000000-0000-0000-0000-0000000000b0";
const NOW = new Date("2026-05-13T12:00:00Z"); // 12:00 UTC

function makeFollowRepo(overrides?: Partial<FollowRepository>): FollowRepository {
  return {
    follow: vi.fn().mockImplementation(async (input: { followerId: string; followeeId: string }): Promise<Follow> => ({
      id: "00000000-0000-0000-0000-00000000f001",
      followerId: input.followerId,
      followeeId: input.followeeId,
      createdAt: NOW,
    })),
    unfollow: vi.fn(),
    findFollow: vi.fn().mockResolvedValue(null),
    listFollowers: vi.fn().mockResolvedValue([]),
    listFollowing: vi.fn().mockResolvedValue([]),
    isMutual: vi.fn().mockResolvedValue(false),
    countMutuals: vi.fn().mockResolvedValue(0),
    listMutualIds: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function makeBlockRepo(overrides?: Partial<BlockRepository>): BlockRepository {
  return {
    block: vi.fn(),
    unblock: vi.fn(),
    findBlock: vi.fn().mockResolvedValue(null),
    listBlockedByUser: vi.fn().mockResolvedValue([]),
    listBlockingUser: vi.fn().mockResolvedValue([]),
    isBlocked: vi.fn().mockResolvedValue(false),
    ...overrides,
  };
}

function makeNotificationRepo(): NotificationRepository {
  const store = new Map<string, unknown>();
  return {
    registerToken: vi.fn(),
    removeToken: vi.fn(),
    listTokensForProfile: vi.fn().mockResolvedValue([]),
    getSetting: vi.fn(async ({ profileId, key }) => {
      const v = store.get(`${profileId}::${key}`);
      return v === undefined ? null : { profileId, key, value: v };
    }),
    setSetting: vi.fn(async ({ profileId, key, value }) => {
      store.set(`${profileId}::${key}`, value);
      return { profileId, key, value };
    }),
    listSettings: vi.fn().mockResolvedValue([]),
  };
}

function makeInAppRepo(overrides?: Partial<InAppNotificationRepository>): InAppNotificationRepository {
  return {
    list: vi.fn().mockResolvedValue([]),
    markRead: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation(async ({ recipientId, actorId, trigger, payload }) => ({
      id: "00000000-0000-0000-0000-00000000c001",
      recipientId,
      ...(actorId ? { actorId } : {}),
      trigger,
      payload,
      createdAt: new Date(),
    })),
    countSince: vi.fn().mockResolvedValue(0),
    countSinceByActor: vi.fn().mockResolvedValue(0),
    listAllByRecipient: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function makeShelfRepo(overrides?: Partial<ShelfRepository>): ShelfRepository {
  return {
    listShelves: vi.fn().mockResolvedValue([]),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    addBook: vi.fn(),
    rankShelfItem: vi.fn(),
    createSystemShelves: vi.fn(),
    findShelfItem: vi.fn().mockResolvedValue(null),
    upsertShelfItem: vi.fn(),
    deleteShelfItem: vi.fn(),
    getMaxPosition: vi.fn().mockResolvedValue(0),
    moveShelfItem: vi.fn(),
    listOwnersWithBookOnSystemShelf: vi.fn().mockResolvedValue([]),
    listShelfItemsByOwner: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function makeRankingsRepo(overrides?: Partial<RankingRepository>): RankingRepository {
  return {
    upsert: vi.fn().mockImplementation(async ({ ownerId, bookId, rank, score }) => ({
      id: "00000000-0000-0000-0000-00000000r001",
      profileId: ownerId,
      bookId,
      position: rank,
      score,
      bucket: 5,
      version: 1,
      createdAt: NOW,
      updatedAt: NOW,
    })),
    findById: vi.fn(),
    findByOwnerAndBook: vi.fn().mockResolvedValue(null),
    listByOwner: vi.fn().mockResolvedValue([]),
    delete: vi.fn(),
    startBucket: vi.fn(),
    ...overrides,
  };
}

function makeActivityRepo(): ActivityRepository {
  return {
    append: vi.fn().mockImplementation(async (event) => ({
      id: "00000000-0000-0000-0000-00000000e001",
      occurredAt: NOW,
      ...event,
    })),
    getFriendFeed: vi.fn().mockResolvedValue([]),
    getFriendFeedGrouped: vi.fn().mockResolvedValue([]),
    deleteByReviewId: vi.fn(),
    listByActor: vi.fn().mockResolvedValue([]),
  };
}

/** 11:00–13:00 UTC quiet window — bracketed around NOW=12:00. */
async function enableQuietHoursAtNoon(notifications: NotificationService, profileId: string): Promise<void> {
  await notifications.updateSettings(profileId, {
    quietHours: { enabled: true, startMinute: 11 * 60, endMinute: 13 * 60 },
  });
}

/** Narrow vitest mock-call inspection to the first argument of `create`. */
interface CreateArg {
  recipientId: string;
  actorId?: string;
  trigger: string;
  payload: Record<string, unknown>;
}
function createCallArgs(create: InAppNotificationRepository["create"]): CreateArg[] {
  const mock = create as unknown as { mock?: { calls: unknown[][] } };
  return (mock.mock?.calls ?? []).map((c) => c[0] as CreateArg);
}

// ---------------------------------------------------------------------------
// Trigger #1 — new follower
// ---------------------------------------------------------------------------

describe("FollowService — new_follower push (#148, Q-04)", () => {
  it("enqueues a new_follower push to the followee when a non-idempotent follow is created", async () => {
    const inApp = makeInAppRepo();
    const notifications = new NotificationService(inApp, makeNotificationRepo());
    const follows = makeFollowRepo();
    const service = new FollowService(follows, makeBlockRepo(), notifications);

    await service.createFollow({ followerId: ACTOR, followeeId: RECIPIENT });

    expect(inApp.create).toHaveBeenCalledTimes(1);
    expect(inApp.create).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: RECIPIENT,
        actorId: ACTOR,
        trigger: "new_follower",
      }),
    );
  });

  it("quiet hours block delivery — no in-app row is created when within the quiet window", async () => {
    const inApp = makeInAppRepo();
    const notifications = new NotificationService(inApp, makeNotificationRepo());
    await enableQuietHoursAtNoon(notifications, RECIPIENT);

    // Pin "now" inside the quiet window for the gating check.
    const follows = makeFollowRepo();
    const service = new FollowService(follows, makeBlockRepo(), notifications);

    // Patch the canSend `now` by stubbing Date.now via vi.useFakeTimers.
    vi.useFakeTimers({ now: NOW });
    try {
      await service.createFollow({ followerId: ACTOR, followeeId: RECIPIENT });
    } finally {
      vi.useRealTimers();
    }

    expect(inApp.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Trigger #2 — mutual follow back
// ---------------------------------------------------------------------------

describe("FollowService — mutual_follow_back push (#148, Q-04)", () => {
  it("fires mutual_follow_back (and skips the plain new_follower) when the reverse edge already exists", async () => {
    const inApp = makeInAppRepo();
    const notifications = new NotificationService(inApp, makeNotificationRepo());
    // The recipient (followee of the new edge) already follows the new follower.
    const reverseEdge: Follow = {
      id: "00000000-0000-0000-0000-00000000fr01",
      followerId: RECIPIENT,
      followeeId: ACTOR,
      createdAt: NOW,
    };
    const follows = makeFollowRepo({
      // findFollow is called twice in createFollow: once for idempotency
      // (followerId, followeeId) and once for the reverse edge.
      findFollow: vi.fn().mockImplementation(async (input: { followerId: string; followeeId: string }) => {
        if (input.followerId === RECIPIENT && input.followeeId === ACTOR) return reverseEdge;
        return null;
      }),
    });
    const service = new FollowService(follows, makeBlockRepo(), notifications);

    await service.createFollow({ followerId: ACTOR, followeeId: RECIPIENT });

    expect(inApp.create).toHaveBeenCalledTimes(1);
    expect(inApp.create).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: RECIPIENT,
        actorId: ACTOR,
        trigger: "mutual_follow_back",
      }),
    );
  });

  it("quiet hours block delivery for mutual_follow_back", async () => {
    const inApp = makeInAppRepo();
    const notifications = new NotificationService(inApp, makeNotificationRepo());
    await enableQuietHoursAtNoon(notifications, RECIPIENT);

    const reverseEdge: Follow = {
      id: "00000000-0000-0000-0000-00000000fr02",
      followerId: RECIPIENT,
      followeeId: ACTOR,
      createdAt: NOW,
    };
    const follows = makeFollowRepo({
      findFollow: vi.fn().mockImplementation(async (input: { followerId: string; followeeId: string }) => {
        if (input.followerId === RECIPIENT && input.followeeId === ACTOR) return reverseEdge;
        return null;
      }),
    });
    const service = new FollowService(follows, makeBlockRepo(), notifications);

    vi.useFakeTimers({ now: NOW });
    try {
      await service.createFollow({ followerId: ACTOR, followeeId: RECIPIENT });
    } finally {
      vi.useRealTimers();
    }

    expect(inApp.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Trigger #3 — mutual rates 8+
// ---------------------------------------------------------------------------

describe("RankingService — mutual_rated_high push (#148, Q-04)", () => {
  it("fans out mutual_rated_high to each mutual when the new score is >= 8", async () => {
    const inApp = makeInAppRepo();
    const notifications = new NotificationService(inApp, makeNotificationRepo());
    const follows = makeFollowRepo({
      listMutualIds: vi.fn().mockResolvedValue([RECIPIENT, MUTUAL_A]),
    });
    const shelves = makeShelfRepo();
    const rankings = makeRankingsRepo();
    const service = new RankingService(
      rankings,
      makeActivityRepo(),
      follows,
      shelves,
      notifications,
    );

    // position=1 of total=10 → scoreFromRank = 10 (top of band)
    await service.finishBook({
      ownerId: ACTOR,
      bookId: BOOK,
      position: 1,
      total: 10,
    });

    const calls = createCallArgs(inApp.create);
    const highRatingCalls = calls.filter((arg) => arg.trigger === "mutual_rated_high");
    expect(highRatingCalls).toHaveLength(2);
    const recipientIds = highRatingCalls.map((arg) => arg.recipientId);
    expect(recipientIds).toEqual(expect.arrayContaining([RECIPIENT, MUTUAL_A]));
  });

  it("does not fire mutual_rated_high when the score is below 8", async () => {
    const inApp = makeInAppRepo();
    const notifications = new NotificationService(inApp, makeNotificationRepo());
    const follows = makeFollowRepo({
      listMutualIds: vi.fn().mockResolvedValue([RECIPIENT]),
    });
    const service = new RankingService(
      makeRankingsRepo(),
      makeActivityRepo(),
      follows,
      makeShelfRepo(),
      notifications,
    );

    // position=5 of total=10 → score ≈ 5.56, well below threshold
    await service.finishBook({
      ownerId: ACTOR,
      bookId: BOOK,
      position: 5,
      total: 10,
    });

    const calls = createCallArgs(inApp.create);
    const highRatingCalls = calls.filter((arg) => arg.trigger === "mutual_rated_high");
    expect(highRatingCalls).toHaveLength(0);
  });

  it("quiet hours block mutual_rated_high delivery for an in-window recipient", async () => {
    const inApp = makeInAppRepo();
    const notifications = new NotificationService(inApp, makeNotificationRepo());
    await enableQuietHoursAtNoon(notifications, RECIPIENT);

    const follows = makeFollowRepo({
      listMutualIds: vi.fn().mockResolvedValue([RECIPIENT]),
    });
    const service = new RankingService(
      makeRankingsRepo(),
      makeActivityRepo(),
      follows,
      makeShelfRepo(),
      notifications,
    );

    vi.useFakeTimers({ now: NOW });
    try {
      await service.finishBook({
        ownerId: ACTOR,
        bookId: BOOK,
        position: 1,
        total: 10, // score = 10, would normally fire
      });
    } finally {
      vi.useRealTimers();
    }

    const calls = createCallArgs(inApp.create);
    const highRatingCalls = calls.filter((arg) => arg.trigger === "mutual_rated_high");
    expect(highRatingCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Trigger #4 — mutual finishes WTR book
// ---------------------------------------------------------------------------

describe("RankingService — mutual_finished_want_to_read push (#148, Q-04)", () => {
  it("fires mutual_finished_want_to_read for each mutual whose WTR shelf contains the finished book", async () => {
    const inApp = makeInAppRepo();
    const notifications = new NotificationService(inApp, makeNotificationRepo());
    const follows = makeFollowRepo({
      listMutualIds: vi.fn().mockResolvedValue([RECIPIENT, MUTUAL_A]),
    });
    const shelves = makeShelfRepo({
      // Only RECIPIENT has the book on their WTR shelf
      listOwnersWithBookOnSystemShelf: vi.fn().mockResolvedValue([RECIPIENT]),
    });
    const service = new RankingService(
      makeRankingsRepo(),
      makeActivityRepo(),
      follows,
      shelves,
      notifications,
    );

    // score = 5.56 < 8 so we don't conflate with #3
    await service.finishBook({
      ownerId: ACTOR,
      bookId: BOOK,
      position: 5,
      total: 10,
    });

    expect(shelves.listOwnersWithBookOnSystemShelf).toHaveBeenCalledWith({
      bookId: BOOK,
      slug: "want-to-read",
      ownerIds: [RECIPIENT, MUTUAL_A],
    });

    const calls = createCallArgs(inApp.create);
    const wtrCalls = calls.filter((arg) => arg.trigger === "mutual_finished_want_to_read");
    expect(wtrCalls).toHaveLength(1);
    expect(wtrCalls[0]).toMatchObject({
      recipientId: RECIPIENT,
      actorId: ACTOR,
      trigger: "mutual_finished_want_to_read",
    });
  });

  it("quiet hours block mutual_finished_want_to_read delivery", async () => {
    const inApp = makeInAppRepo();
    const notifications = new NotificationService(inApp, makeNotificationRepo());
    await enableQuietHoursAtNoon(notifications, RECIPIENT);

    const follows = makeFollowRepo({
      listMutualIds: vi.fn().mockResolvedValue([RECIPIENT]),
    });
    const shelves = makeShelfRepo({
      listOwnersWithBookOnSystemShelf: vi.fn().mockResolvedValue([RECIPIENT]),
    });
    const service = new RankingService(
      makeRankingsRepo(),
      makeActivityRepo(),
      follows,
      shelves,
      notifications,
    );

    vi.useFakeTimers({ now: NOW });
    try {
      await service.finishBook({
        ownerId: ACTOR,
        bookId: BOOK,
        position: 5,
        total: 10,
      });
    } finally {
      vi.useRealTimers();
    }

    const calls = createCallArgs(inApp.create);
    const wtrCalls = calls.filter((arg) => arg.trigger === "mutual_finished_want_to_read");
    expect(wtrCalls).toHaveLength(0);
  });
});
