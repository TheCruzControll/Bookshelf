import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { trpcServer } from "@hono/trpc-server";
import { createTrpcContext } from "./context";
import { router } from "./trpc";
import { feedRouter } from "./feed";
import type { AppRepositories, AuthIdentity, FeedItem } from "@hone/domain";
import { POSTURE_C_DEFAULTS, encodeFeedCursor } from "@hone/domain";

vi.mock("@hone/observability", () => ({
  captureException: vi.fn(),
  createLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn() })),
  initSentry: vi.fn(),
  setSentryUser: vi.fn(),
  clearSentryUser: vi.fn(),
}));

const UUID1 = "00000000-0000-0000-0000-000000000001";
const UUID2 = "00000000-0000-0000-0000-000000000002";
const UUID3 = "00000000-0000-0000-0000-000000000003";
const UUID_E1 = "00000000-0000-0000-0000-0000000000e1";
const UUID_E2 = "00000000-0000-0000-0000-0000000000e2";
const UUID_E3 = "00000000-0000-0000-0000-0000000000e3";
const NOW = new Date("2025-06-01T12:00:00Z");

function makeFeedItem(overrides?: Partial<FeedItem>): FeedItem {
  return {
    event: {
      id: UUID2,
      actorId: UUID2,
      verb: "book_added",
      visibility: "followers",
      occurredAt: NOW,
      groupKey: `${UUID2}:book_added:12345`,
      ...(overrides?.event ?? {}),
    },
    actor: {
      id: UUID2,
      handle: "reader",
      displayName: "Reader",
      verified: false,
      defaultVisibility: POSTURE_C_DEFAULTS,
      version: 1,
      createdAt: NOW,
      updatedAt: NOW,
      ...(overrides?.actor ?? {}),
    },
    ...overrides,
  } as FeedItem;
}

function makeRepositories(overrides?: Partial<AppRepositories>): AppRepositories {
  return {
    accountDeletions: { create: vi.fn(), findByProfileId: vi.fn().mockResolvedValue(null), delete: vi.fn(), listExpired: vi.fn().mockResolvedValue([]), purgeProfile: vi.fn() },
    profiles: {
      findById: vi.fn(),
      findByHandle: vi.fn(),
      create: vi.fn(),
      isHandleTaken: vi.fn(),
      setHandle: vi.fn(),
    },
    books: { findBookById: vi.fn(), findEditionByIsbn: vi.fn(), search: vi.fn() },
    shelves: {
      listShelves: vi.fn().mockResolvedValue([]),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      addBook: vi.fn(),
      rankShelfItem: vi.fn(),
      createSystemShelves: vi.fn(),
      findShelfItem: vi.fn(),
      upsertShelfItem: vi.fn(),
      deleteShelfItem: vi.fn(),
      getMaxPosition: vi.fn().mockResolvedValue(0),
      moveShelfItem: vi.fn(),
      listOwnersWithBookOnSystemShelf: vi.fn().mockResolvedValue([]),
    },
    reviews: { findById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    activity: {
      append: vi.fn(),
      getFriendFeed: vi.fn().mockResolvedValue([]),
      getFriendFeedGrouped: vi.fn().mockResolvedValue([]),
      deleteByReviewId: vi.fn(),
    },
    recommendations: { getForUser: vi.fn() },
    follows: { follow: vi.fn(), unfollow: vi.fn(), findFollow: vi.fn(), listFollowers: vi.fn(), listFollowing: vi.fn(), isMutual: vi.fn().mockResolvedValue(false), countMutuals: vi.fn(), listMutualIds: vi.fn().mockResolvedValue([]) },
    blocks: { block: vi.fn(), unblock: vi.fn(), findBlock: vi.fn(), listBlockedByUser: vi.fn().mockResolvedValue([]), listBlockingUser: vi.fn().mockResolvedValue([]), isBlocked: vi.fn() },
    rankings: { upsert: vi.fn(), findById: vi.fn(), findByOwnerAndBook: vi.fn(), listByOwner: vi.fn(), delete: vi.fn(), startBucket: vi.fn() },
    notifications: { registerToken: vi.fn(), removeToken: vi.fn(), listTokensForProfile: vi.fn(), getSetting: vi.fn(), setSetting: vi.fn(), listSettings: vi.fn() },
    imports: { create: vi.fn(), findById: vi.fn(), findByOwnerAndHash: vi.fn(), listByOwner: vi.fn(), updateStatus: vi.fn() },
    contacts: { upsertHashes: vi.fn(), findMatches: vi.fn(), findMatchingProfilesByPhone: vi.fn(), deleteForUser: vi.fn(), deleteExpired: vi.fn(), listByUser: vi.fn(), expireBySaltVersion: vi.fn(), deleteByTargetHash: vi.fn() },
    lists: { create: vi.fn(), findById: vi.fn(), listByOwner: vi.fn(), update: vi.fn(), delete: vi.fn(), addItem: vi.fn(), removeItem: vi.fn(), listItems: vi.fn(), reorderItems: vi.fn() },
    authIdentities: { create: vi.fn(), findByProvider: vi.fn(), listByProfile: vi.fn() },
    sessions: { create: vi.fn(), findByTokenHash: vi.fn(), revokeByTokenHash: vi.fn(), revokeAllForProfile: vi.fn() },
    handleHistory: { record: vi.fn(), findCurrentByOldHandle: vi.fn() },
    magicLinks: { create: vi.fn(), findByTokenHash: vi.fn(), markConsumed: vi.fn(), deleteExpiredForEmail: vi.fn() },
    emailIndex: { upsertHashes: vi.fn(), findMatches: vi.fn(), deleteForUser: vi.fn(), deleteExpired: vi.fn(), listByUser: vi.fn(), expireBySaltVersion: vi.fn(), deleteByTargetHash: vi.fn() },
    inAppNotifications: {
      list: vi.fn().mockResolvedValue([]),
      markRead: vi.fn(),
      findById: vi.fn(),
      countSince: vi.fn().mockResolvedValue(0),
      countSinceByActor: vi.fn().mockResolvedValue(0),
      create: vi.fn(),
    },
    phoneVerifications: { upsert: vi.fn(), findByPhone: vi.fn(), incrementAttempts: vi.fn(), deleteByPhone: vi.fn(), deleteExpired: vi.fn() },
    phoneNumbers: { upsert: vi.fn(), findByProfileId: vi.fn(), findByHash: vi.fn() },
    salts: { create: vi.fn(), findActive: vi.fn(), findByVersion: vi.fn(), retire: vi.fn(), getLatestVersion: vi.fn(), listAll: vi.fn() },
    ...overrides,
  };
}

function makeIdentity(overrides?: Partial<AuthIdentity>): AuthIdentity {
  return {
    userId: UUID1,
    ...overrides,
  };
}

function buildApp(identity: AuthIdentity | null, repositories: AppRepositories) {
  const testRouter = router({ feed: feedRouter });
  const app = new Hono();
  const auth = { getCurrentIdentity: async () => identity };
  app.use(
    "/trpc/*",
    trpcServer({
      router: testRouter,
      createContext: createTrpcContext({ repositories, auth }),
    })
  );
  return app;
}

describe("feed.list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    const repos = makeRepositories();
    const app = buildApp(null, repos);
    const res = await app.request(
      `/trpc/feed.list?input=${encodeURIComponent(JSON.stringify({ limit: 20 }))}`
    );
    expect(res.status).toBe(401);
  });

  it("returns empty groups array when no feed items", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request(
      `/trpc/feed.list?input=${encodeURIComponent(JSON.stringify({ limit: 20 }))}`
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.groups).toEqual([]);
    expect(body.result.data.nextCursor).toBeNull();
  });

  it("groups feed items by groupKey", async () => {
    const groupKey = `${UUID2}:book_added:12345`;
    const items: FeedItem[] = [
      makeFeedItem({
        event: { id: UUID_E1, actorId: UUID2, verb: "book_added", visibility: "followers", occurredAt: new Date("2025-06-01T12:05:00Z"), groupKey },
        actor: { id: UUID2, handle: "reader", displayName: "Reader", verified: false, defaultVisibility: POSTURE_C_DEFAULTS, version: 1, createdAt: NOW, updatedAt: NOW },
      }),
      makeFeedItem({
        event: { id: UUID_E2, actorId: UUID2, verb: "book_added", visibility: "followers", occurredAt: new Date("2025-06-01T12:00:00Z"), groupKey },
        actor: { id: UUID2, handle: "reader", displayName: "Reader", verified: false, defaultVisibility: POSTURE_C_DEFAULTS, version: 1, createdAt: NOW, updatedAt: NOW },
      }),
    ];
    const repos = makeRepositories({
      activity: {
        append: vi.fn(),
        getFriendFeed: vi.fn().mockResolvedValue([]),
        getFriendFeedGrouped: vi.fn().mockResolvedValue(items),
        deleteByReviewId: vi.fn(),
      },
    });
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request(
      `/trpc/feed.list?input=${encodeURIComponent(JSON.stringify({ limit: 20 }))}`
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.groups).toHaveLength(1);
    expect(body.result.data.groups[0].groupKey).toBe(groupKey);
    expect(body.result.data.groups[0].items).toHaveLength(2);
  });

  it("returns nextCursor when groups fill the page (encoded as base64url)", async () => {
    // Create items from 3 different groups, request limit of 2 groups
    const g1Key = `${UUID2}:book_added:100`;
    const g2Key = `${UUID2}:book_added:101`;
    const g3Key = `${UUID3}:book_added:102`;

    const items: FeedItem[] = [
      makeFeedItem({
        event: { id: UUID_E1, actorId: UUID2, verb: "book_added", visibility: "followers", occurredAt: new Date("2025-06-01T14:00:00Z"), groupKey: g1Key },
        actor: { id: UUID2, handle: "reader", displayName: "Reader", verified: false, defaultVisibility: POSTURE_C_DEFAULTS, version: 1, createdAt: NOW, updatedAt: NOW },
      }),
      makeFeedItem({
        event: { id: UUID_E2, actorId: UUID2, verb: "book_added", visibility: "followers", occurredAt: new Date("2025-06-01T13:00:00Z"), groupKey: g2Key },
        actor: { id: UUID2, handle: "reader", displayName: "Reader", verified: false, defaultVisibility: POSTURE_C_DEFAULTS, version: 1, createdAt: NOW, updatedAt: NOW },
      }),
      makeFeedItem({
        event: { id: UUID_E3, actorId: UUID3, verb: "book_added", visibility: "followers", occurredAt: new Date("2025-06-01T12:00:00Z"), groupKey: g3Key },
        actor: { id: UUID3, handle: "reader2", displayName: "Reader2", verified: false, defaultVisibility: POSTURE_C_DEFAULTS, version: 1, createdAt: NOW, updatedAt: NOW },
      }),
    ];
    const repos = makeRepositories({
      activity: {
        append: vi.fn(),
        getFriendFeed: vi.fn().mockResolvedValue([]),
        getFriendFeedGrouped: vi.fn().mockResolvedValue(items),
        deleteByReviewId: vi.fn(),
      },
    });
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request(
      `/trpc/feed.list?input=${encodeURIComponent(JSON.stringify({ limit: 2 }))}`
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.groups).toHaveLength(2);
    expect(body.result.data.nextCursor).not.toBeNull();
    // The cursor should be a base64url string
    expect(body.result.data.nextCursor).not.toMatch(/[+/=]/);
  });

  it("returns null nextCursor when groups do not fill the page", async () => {
    const groupKey = `${UUID2}:book_added:12345`;
    const items: FeedItem[] = [
      makeFeedItem({
        event: { id: UUID_E1, actorId: UUID2, verb: "book_added", visibility: "followers", occurredAt: NOW, groupKey },
        actor: { id: UUID2, handle: "reader", displayName: "Reader", verified: false, defaultVisibility: POSTURE_C_DEFAULTS, version: 1, createdAt: NOW, updatedAt: NOW },
      }),
    ];
    const repos = makeRepositories({
      activity: {
        append: vi.fn(),
        getFriendFeed: vi.fn().mockResolvedValue([]),
        getFriendFeedGrouped: vi.fn().mockResolvedValue(items),
        deleteByReviewId: vi.fn(),
      },
    });
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request(
      `/trpc/feed.list?input=${encodeURIComponent(JSON.stringify({ limit: 20 }))}`
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.groups).toHaveLength(1);
    expect(body.result.data.nextCursor).toBeNull();
  });

  it("passes decoded cursor to getFriendFeedGrouped", async () => {
    const groupKey = "actor:book_added:999";
    const occurredAt = new Date("2025-06-01T10:00:00Z");
    const cursor = encodeFeedCursor(groupKey, occurredAt);

    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);
    await app.request(
      `/trpc/feed.list?input=${encodeURIComponent(JSON.stringify({ cursor, limit: 10 }))}`
    );
    expect(repos.activity.getFriendFeedGrouped).toHaveBeenCalledWith(
      expect.objectContaining({
        viewerId: UUID1,
        beforeOccurredAt: occurredAt,
        beforeGroupKey: groupKey,
        groupLimit: 10,
      })
    );
  });

  it("page boundaries never split a group", async () => {
    // Scenario: 2 events in group1, 1 event in group2, limit = 1 group
    // The first group should be fully returned without splitting
    const g1Key = `${UUID2}:book_added:100`;
    const g2Key = `${UUID3}:book_finished:101`;

    const items: FeedItem[] = [
      makeFeedItem({
        event: { id: UUID_E1, actorId: UUID2, verb: "book_added", visibility: "followers", occurredAt: new Date("2025-06-01T12:10:00Z"), groupKey: g1Key },
        actor: { id: UUID2, handle: "reader", displayName: "Reader", verified: false, defaultVisibility: POSTURE_C_DEFAULTS, version: 1, createdAt: NOW, updatedAt: NOW },
      }),
      makeFeedItem({
        event: { id: UUID_E2, actorId: UUID2, verb: "book_added", visibility: "followers", occurredAt: new Date("2025-06-01T12:05:00Z"), groupKey: g1Key },
        actor: { id: UUID2, handle: "reader", displayName: "Reader", verified: false, defaultVisibility: POSTURE_C_DEFAULTS, version: 1, createdAt: NOW, updatedAt: NOW },
      }),
      makeFeedItem({
        event: { id: UUID_E3, actorId: UUID3, verb: "book_finished", visibility: "followers", occurredAt: new Date("2025-06-01T11:00:00Z"), groupKey: g2Key },
        actor: { id: UUID3, handle: "reader2", displayName: "Reader2", verified: false, defaultVisibility: POSTURE_C_DEFAULTS, version: 1, createdAt: NOW, updatedAt: NOW },
      }),
    ];
    const repos = makeRepositories({
      activity: {
        append: vi.fn(),
        getFriendFeed: vi.fn().mockResolvedValue([]),
        getFriendFeedGrouped: vi.fn().mockResolvedValue(items),
        deleteByReviewId: vi.fn(),
      },
    });
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request(
      `/trpc/feed.list?input=${encodeURIComponent(JSON.stringify({ limit: 1 }))}`
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // Should return exactly 1 group with all 2 items in it
    expect(body.result.data.groups).toHaveLength(1);
    expect(body.result.data.groups[0].groupKey).toBe(g1Key);
    expect(body.result.data.groups[0].items).toHaveLength(2);
    // nextCursor should be set since there are more groups
    expect(body.result.data.nextCursor).not.toBeNull();
  });
});

describe("feed.list visibility + block filter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows followers-visibility items when viewer follows actor", async () => {
    const groupKey = `${UUID2}:book_added:12345`;
    const items: FeedItem[] = [
      makeFeedItem({
        event: { id: UUID_E1, actorId: UUID2, verb: "book_added", visibility: "followers", occurredAt: NOW, groupKey },
        actor: { id: UUID2, handle: "reader", displayName: "Reader", verified: false, defaultVisibility: POSTURE_C_DEFAULTS, version: 1, createdAt: NOW, updatedAt: NOW },
      }),
    ];
    const repos = makeRepositories({
      activity: {
        append: vi.fn(),
        getFriendFeed: vi.fn().mockResolvedValue([]),
        getFriendFeedGrouped: vi.fn().mockResolvedValue(items),
        deleteByReviewId: vi.fn(),
      },
      follows: { follow: vi.fn(), unfollow: vi.fn(), findFollow: vi.fn(), listFollowers: vi.fn(), listFollowing: vi.fn(), isMutual: vi.fn().mockResolvedValue(false), countMutuals: vi.fn(), listMutualIds: vi.fn().mockResolvedValue([]) },
    });
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request(
      `/trpc/feed.list?input=${encodeURIComponent(JSON.stringify({ limit: 20 }))}`
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.groups).toHaveLength(1);
  });

  it("shows mutuals-visibility items when viewer and actor are mutuals", async () => {
    const groupKey = `${UUID2}:book_finished:12345`;
    const items: FeedItem[] = [
      makeFeedItem({
        event: { id: UUID_E1, actorId: UUID2, verb: "book_finished", visibility: "mutuals", occurredAt: NOW, groupKey },
        actor: { id: UUID2, handle: "reader", displayName: "Reader", verified: false, defaultVisibility: POSTURE_C_DEFAULTS, version: 1, createdAt: NOW, updatedAt: NOW },
      }),
    ];
    const repos = makeRepositories({
      activity: {
        append: vi.fn(),
        getFriendFeed: vi.fn().mockResolvedValue([]),
        getFriendFeedGrouped: vi.fn().mockResolvedValue(items),
        deleteByReviewId: vi.fn(),
      },
      follows: { follow: vi.fn(), unfollow: vi.fn(), findFollow: vi.fn(), listFollowers: vi.fn(), listFollowing: vi.fn(), isMutual: vi.fn().mockResolvedValue(true), countMutuals: vi.fn(), listMutualIds: vi.fn().mockResolvedValue([]) },
    });
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request(
      `/trpc/feed.list?input=${encodeURIComponent(JSON.stringify({ limit: 20 }))}`
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.groups).toHaveLength(1);
  });

  it("hides mutuals-visibility items when viewer only follows actor (not mutual)", async () => {
    const groupKey = `${UUID2}:book_finished:12345`;
    const items: FeedItem[] = [
      makeFeedItem({
        event: { id: UUID_E1, actorId: UUID2, verb: "book_finished", visibility: "mutuals", occurredAt: NOW, groupKey },
        actor: { id: UUID2, handle: "reader", displayName: "Reader", verified: false, defaultVisibility: POSTURE_C_DEFAULTS, version: 1, createdAt: NOW, updatedAt: NOW },
      }),
    ];
    const repos = makeRepositories({
      activity: {
        append: vi.fn(),
        getFriendFeed: vi.fn().mockResolvedValue([]),
        getFriendFeedGrouped: vi.fn().mockResolvedValue(items),
        deleteByReviewId: vi.fn(),
      },
      follows: { follow: vi.fn(), unfollow: vi.fn(), findFollow: vi.fn(), listFollowers: vi.fn(), listFollowing: vi.fn(), isMutual: vi.fn().mockResolvedValue(false), countMutuals: vi.fn(), listMutualIds: vi.fn().mockResolvedValue([]) },
    });
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request(
      `/trpc/feed.list?input=${encodeURIComponent(JSON.stringify({ limit: 20 }))}`
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.groups).toHaveLength(0);
  });

  it("hides private-visibility items from all feed viewers", async () => {
    const groupKey = `${UUID2}:book_added:12345`;
    const items: FeedItem[] = [
      makeFeedItem({
        event: { id: UUID_E1, actorId: UUID2, verb: "book_added", visibility: "private", occurredAt: NOW, groupKey },
        actor: { id: UUID2, handle: "reader", displayName: "Reader", verified: false, defaultVisibility: POSTURE_C_DEFAULTS, version: 1, createdAt: NOW, updatedAt: NOW },
      }),
    ];
    const repos = makeRepositories({
      activity: {
        append: vi.fn(),
        getFriendFeed: vi.fn().mockResolvedValue([]),
        getFriendFeedGrouped: vi.fn().mockResolvedValue(items),
        deleteByReviewId: vi.fn(),
      },
      follows: { follow: vi.fn(), unfollow: vi.fn(), findFollow: vi.fn(), listFollowers: vi.fn(), listFollowing: vi.fn(), isMutual: vi.fn().mockResolvedValue(true), countMutuals: vi.fn(), listMutualIds: vi.fn().mockResolvedValue([]) },
    });
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request(
      `/trpc/feed.list?input=${encodeURIComponent(JSON.stringify({ limit: 20 }))}`
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.groups).toHaveLength(0);
  });

  it("filters blocked users and respects visibility in same feed", async () => {
    const g1Key = `${UUID2}:book_added:100`;
    const g2Key = `${UUID3}:book_finished:101`;
    const items: FeedItem[] = [
      makeFeedItem({
        event: { id: UUID_E1, actorId: UUID2, verb: "book_added", visibility: "followers", occurredAt: new Date("2025-06-01T14:00:00Z"), groupKey: g1Key },
        actor: { id: UUID2, handle: "reader", displayName: "Reader", verified: false, defaultVisibility: POSTURE_C_DEFAULTS, version: 1, createdAt: NOW, updatedAt: NOW },
      }),
      makeFeedItem({
        event: { id: UUID_E2, actorId: UUID3, verb: "book_finished", visibility: "mutuals", occurredAt: new Date("2025-06-01T13:00:00Z"), groupKey: g2Key },
        actor: { id: UUID3, handle: "reader2", displayName: "Reader2", verified: false, defaultVisibility: POSTURE_C_DEFAULTS, version: 1, createdAt: NOW, updatedAt: NOW },
      }),
    ];
    const repos = makeRepositories({
      activity: {
        append: vi.fn(),
        getFriendFeed: vi.fn().mockResolvedValue([]),
        getFriendFeedGrouped: vi.fn().mockResolvedValue(items),
        deleteByReviewId: vi.fn(),
      },
      // UUID2 is blocked by viewer
      blocks: { block: vi.fn(), unblock: vi.fn(), findBlock: vi.fn(), listBlockedByUser: vi.fn().mockResolvedValue([{ blockerId: UUID1, blockedId: UUID2, createdAt: NOW }]), listBlockingUser: vi.fn().mockResolvedValue([]), isBlocked: vi.fn() },
      // UUID3 is not mutual → mutuals-visibility item hidden
      follows: { follow: vi.fn(), unfollow: vi.fn(), findFollow: vi.fn(), listFollowers: vi.fn(), listFollowing: vi.fn(), isMutual: vi.fn().mockResolvedValue(false), countMutuals: vi.fn(), listMutualIds: vi.fn().mockResolvedValue([]) },
    });
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request(
      `/trpc/feed.list?input=${encodeURIComponent(JSON.stringify({ limit: 20 }))}`
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // UUID2's item blocked, UUID3's item hidden by visibility → empty
    expect(body.result.data.groups).toHaveLength(0);
  });

  it("mixed visibility: shows followers items, hides mutuals items from non-mutual", async () => {
    const g1Key = `${UUID2}:book_added:100`;
    const g2Key = `${UUID2}:book_reviewed:101`;
    const items: FeedItem[] = [
      makeFeedItem({
        event: { id: UUID_E1, actorId: UUID2, verb: "book_added", visibility: "followers", occurredAt: new Date("2025-06-01T14:00:00Z"), groupKey: g1Key },
        actor: { id: UUID2, handle: "reader", displayName: "Reader", verified: false, defaultVisibility: POSTURE_C_DEFAULTS, version: 1, createdAt: NOW, updatedAt: NOW },
      }),
      makeFeedItem({
        event: { id: UUID_E2, actorId: UUID2, verb: "book_reviewed", visibility: "mutuals", occurredAt: new Date("2025-06-01T13:00:00Z"), groupKey: g2Key },
        actor: { id: UUID2, handle: "reader", displayName: "Reader", verified: false, defaultVisibility: POSTURE_C_DEFAULTS, version: 1, createdAt: NOW, updatedAt: NOW },
      }),
    ];
    const repos = makeRepositories({
      activity: {
        append: vi.fn(),
        getFriendFeed: vi.fn().mockResolvedValue([]),
        getFriendFeedGrouped: vi.fn().mockResolvedValue(items),
        deleteByReviewId: vi.fn(),
      },
      follows: { follow: vi.fn(), unfollow: vi.fn(), findFollow: vi.fn(), listFollowers: vi.fn(), listFollowing: vi.fn(), isMutual: vi.fn().mockResolvedValue(false), countMutuals: vi.fn(), listMutualIds: vi.fn().mockResolvedValue([]) },
    });
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request(
      `/trpc/feed.list?input=${encodeURIComponent(JSON.stringify({ limit: 20 }))}`
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.groups).toHaveLength(1);
    expect(body.result.data.groups[0].groupKey).toBe(g1Key);
  });

  it("public-visibility items are always shown regardless of relationship", async () => {
    const groupKey = `${UUID2}:book_finished:12345`;
    const items: FeedItem[] = [
      makeFeedItem({
        event: { id: UUID_E1, actorId: UUID2, verb: "book_finished", visibility: "public", occurredAt: NOW, groupKey },
        actor: { id: UUID2, handle: "reader", displayName: "Reader", verified: false, defaultVisibility: POSTURE_C_DEFAULTS, version: 1, createdAt: NOW, updatedAt: NOW },
      }),
    ];
    const repos = makeRepositories({
      activity: {
        append: vi.fn(),
        getFriendFeed: vi.fn().mockResolvedValue([]),
        getFriendFeedGrouped: vi.fn().mockResolvedValue(items),
        deleteByReviewId: vi.fn(),
      },
      follows: { follow: vi.fn(), unfollow: vi.fn(), findFollow: vi.fn(), listFollowers: vi.fn(), listFollowing: vi.fn(), isMutual: vi.fn().mockResolvedValue(false), countMutuals: vi.fn(), listMutualIds: vi.fn().mockResolvedValue([]) },
    });
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request(
      `/trpc/feed.list?input=${encodeURIComponent(JSON.stringify({ limit: 20 }))}`
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.groups).toHaveLength(1);
  });
});
