import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { trpcServer } from "@hono/trpc-server";
import { createTrpcContext } from "./context";
import { router } from "./trpc";
import { notificationsRouter } from "./notifications";
import type { AppRepositories, AuthIdentity, InAppNotification } from "@hone/domain";

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
const UUID4 = "00000000-0000-0000-0000-000000000004";
const NOW = new Date();

function makeNotification(overrides?: Partial<InAppNotification>): InAppNotification {
  return {
    id: UUID2,
    recipientId: UUID1,
    actorId: UUID3,
    trigger: "new_follower",
    payload: {},
    createdAt: NOW,
    ...overrides,
  };
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
    activity: { append: vi.fn(), getFriendFeed: vi.fn(), getFriendFeedGrouped: vi.fn(), deleteByReviewId: vi.fn() },
    recommendations: { getForUser: vi.fn() },
    follows: { follow: vi.fn(), unfollow: vi.fn(), findFollow: vi.fn(), listFollowers: vi.fn(), listFollowing: vi.fn(), isMutual: vi.fn(), countMutuals: vi.fn(), listMutualIds: vi.fn().mockResolvedValue([]) },
    blocks: { block: vi.fn(), unblock: vi.fn(), findBlock: vi.fn(), listBlockedByUser: vi.fn(), listBlockingUser: vi.fn(), isBlocked: vi.fn() },
    rankings: { upsert: vi.fn(), findById: vi.fn(), findByOwnerAndBook: vi.fn(), listByOwner: vi.fn(), delete: vi.fn(), startBucket: vi.fn() },
    notifications: { registerToken: vi.fn(), removeToken: vi.fn(), listTokensForProfile: vi.fn(), getSetting: vi.fn(), setSetting: vi.fn(), listSettings: vi.fn() },
    imports: { create: vi.fn(), findById: vi.fn(), findByOwnerAndHash: vi.fn(), listByOwner: vi.fn(), updateStatus: vi.fn() },
    contacts: { upsertHashes: vi.fn(), findMatches: vi.fn(), findMatchingProfilesByPhone: vi.fn(), deleteForUser: vi.fn(), deleteExpired: vi.fn(), deleteByTargetHash: vi.fn(), listByUser: vi.fn(), expireBySaltVersion: vi.fn() },
    lists: { create: vi.fn(), findById: vi.fn(), listByOwner: vi.fn(), update: vi.fn(), delete: vi.fn(), addItem: vi.fn(), removeItem: vi.fn(), listItems: vi.fn(), reorderItems: vi.fn() },
    authIdentities: { create: vi.fn(), findByProvider: vi.fn(), listByProfile: vi.fn() },
    sessions: { create: vi.fn(), findByTokenHash: vi.fn(), revokeByTokenHash: vi.fn(), revokeAllForProfile: vi.fn() },
    handleHistory: { record: vi.fn(), findCurrentByOldHandle: vi.fn() },
    magicLinks: { create: vi.fn(), findByTokenHash: vi.fn(), markConsumed: vi.fn(), deleteExpiredForEmail: vi.fn() },
    emailIndex: { upsertHashes: vi.fn(), findMatches: vi.fn(), deleteForUser: vi.fn(), deleteExpired: vi.fn(), deleteByTargetHash: vi.fn(), listByUser: vi.fn(), expireBySaltVersion: vi.fn() },
    inAppNotifications: {
      list: vi.fn().mockResolvedValue([]),
      markRead: vi.fn().mockResolvedValue(undefined),
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
  const testRouter = router({ notifications: notificationsRouter });
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

describe("notifications.list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns paginated notifications newest first", async () => {
    const older = makeNotification({
      id: UUID2,
      createdAt: new Date("2025-01-01T00:00:00Z"),
    });
    const newer = makeNotification({
      id: UUID3,
      createdAt: new Date("2025-01-02T00:00:00Z"),
    });
    const repos = makeRepositories({
      inAppNotifications: {
        list: vi.fn().mockResolvedValue([newer, older]),
        markRead: vi.fn(),
        findById: vi.fn(),
        countSince: vi.fn().mockResolvedValue(0),
        countSinceByActor: vi.fn().mockResolvedValue(0),
        create: vi.fn(),
      },
    });
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request(
      `/trpc/notifications.list?input=${encodeURIComponent(JSON.stringify({ limit: 20 }))}`
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.notifications).toHaveLength(2);
    expect(body.result.data.notifications[0].id).toBe(UUID3);
    expect(body.result.data.notifications[1].id).toBe(UUID2);
  });

  it("returns empty array when no notifications", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request(
      `/trpc/notifications.list?input=${encodeURIComponent(JSON.stringify({ limit: 20 }))}`
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.notifications).toHaveLength(0);
    expect(body.result.data.nextCursor).toBeNull();
  });

  it("returns nextCursor when results fill the page", async () => {
    const notifs = Array.from({ length: 5 }, (_, i) =>
      makeNotification({
        id: `00000000-0000-0000-0000-00000000000${i + 1}`,
        createdAt: new Date(Date.now() - i * 1000),
      })
    );
    const repos = makeRepositories({
      inAppNotifications: {
        list: vi.fn().mockResolvedValue(notifs),
        markRead: vi.fn(),
        findById: vi.fn(),
        countSince: vi.fn().mockResolvedValue(0),
        countSinceByActor: vi.fn().mockResolvedValue(0),
        create: vi.fn(),
      },
    });
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request(
      `/trpc/notifications.list?input=${encodeURIComponent(JSON.stringify({ limit: 5 }))}`
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.notifications).toHaveLength(5);
    expect(body.result.data.nextCursor).toBe("00000000-0000-0000-0000-000000000005");
  });

  it("returns null nextCursor when results do not fill the page", async () => {
    const notifs = [makeNotification()];
    const repos = makeRepositories({
      inAppNotifications: {
        list: vi.fn().mockResolvedValue(notifs),
        markRead: vi.fn(),
        findById: vi.fn(),
        countSince: vi.fn().mockResolvedValue(0),
        countSinceByActor: vi.fn().mockResolvedValue(0),
        create: vi.fn(),
      },
    });
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request(
      `/trpc/notifications.list?input=${encodeURIComponent(JSON.stringify({ limit: 20 }))}`
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.nextCursor).toBeNull();
  });

  it("passes cursor to the repository", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);
    await app.request(
      `/trpc/notifications.list?input=${encodeURIComponent(JSON.stringify({ cursor: UUID4, limit: 10 }))}`
    );
    expect(repos.inAppNotifications.list).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: UUID4, limit: 10, recipientId: UUID1 })
    );
  });

  it("returns 401 when unauthenticated", async () => {
    const repos = makeRepositories();
    const app = buildApp(null, repos);
    const res = await app.request(
      `/trpc/notifications.list?input=${encodeURIComponent(JSON.stringify({ limit: 20 }))}`
    );
    expect(res.status).toBe(401);
  });
});

describe("notifications.markRead", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks a notification as read", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request("/trpc/notifications.markRead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationId: UUID2 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.success).toBe(true);
    expect(repos.inAppNotifications.markRead).toHaveBeenCalledWith({
      recipientId: UUID1,
      notificationId: UUID2,
    });
  });

  it("is idempotent (calling markRead twice succeeds)", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);

    // First call
    const res1 = await app.request("/trpc/notifications.markRead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationId: UUID2 }),
    });
    expect(res1.status).toBe(200);

    // Second call (idempotent)
    const res2 = await app.request("/trpc/notifications.markRead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationId: UUID2 }),
    });
    expect(res2.status).toBe(200);
    const body = await res2.json();
    expect(body.result.data.success).toBe(true);
  });

  it("returns 401 when unauthenticated", async () => {
    const repos = makeRepositories();
    const app = buildApp(null, repos);
    const res = await app.request("/trpc/notifications.markRead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationId: UUID2 }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects invalid notificationId (non-UUID)", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request("/trpc/notifications.markRead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationId: "not-a-uuid" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("notifications.registerToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers an APNs token for the authenticated user", async () => {
    const repos = makeRepositories({
      notifications: {
        registerToken: vi.fn().mockResolvedValue({
          profileId: UUID1,
          platform: "apns",
          token: "device-token-1",
          lastSeen: new Date("2026-05-13T00:00:00Z"),
        }),
        removeToken: vi.fn(),
        listTokensForProfile: vi.fn(),
        getSetting: vi.fn(),
        setSetting: vi.fn(),
        listSettings: vi.fn(),
      },
    });
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request("/trpc/notifications.registerToken", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform: "apns", token: "device-token-1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.platform).toBe("apns");
    expect(body.result.data.token).toBe("device-token-1");
    expect(repos.notifications.registerToken).toHaveBeenCalledWith({
      profileId: UUID1,
      platform: "apns",
      token: "device-token-1",
    });
  });

  it("registers an FCM token", async () => {
    const repos = makeRepositories({
      notifications: {
        registerToken: vi.fn().mockResolvedValue({
          profileId: UUID1,
          platform: "fcm",
          token: "fcm-tok",
          lastSeen: new Date(),
        }),
        removeToken: vi.fn(),
        listTokensForProfile: vi.fn(),
        getSetting: vi.fn(),
        setSetting: vi.fn(),
        listSettings: vi.fn(),
      },
    });
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request("/trpc/notifications.registerToken", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform: "fcm", token: "fcm-tok" }),
    });
    expect(res.status).toBe(200);
  });

  it("rejects unknown platforms", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request("/trpc/notifications.registerToken", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform: "bogus", token: "x" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects empty tokens", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request("/trpc/notifications.registerToken", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform: "apns", token: "" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    const repos = makeRepositories();
    const app = buildApp(null, repos);
    const res = await app.request("/trpc/notifications.registerToken", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform: "apns", token: "x" }),
    });
    expect(res.status).toBe(401);
  });
});

describe("notifications.unregisterToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("removes a token for the authenticated user", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request("/trpc/notifications.unregisterToken", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "device-token-1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.success).toBe(true);
    expect(repos.notifications.removeToken).toHaveBeenCalledWith({
      profileId: UUID1,
      token: "device-token-1",
    });
  });

  it("returns 401 when unauthenticated", async () => {
    const repos = makeRepositories();
    const app = buildApp(null, repos);
    const res = await app.request("/trpc/notifications.unregisterToken", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "x" }),
    });
    expect(res.status).toBe(401);
  });
});
