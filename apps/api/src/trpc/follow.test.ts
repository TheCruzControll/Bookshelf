import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { trpcServer } from "@hono/trpc-server";
import { createTrpcContext, type TrpcContextDeps } from "./context";
import { router } from "./trpc";
import { followRouter } from "./follow";
import type { AppRepositories, AuthIdentity, Follow, Block } from "@hone/domain";
import type { Cache } from "@hone/cache";

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
const NOW = new Date();

function makeFollow(overrides?: Partial<Follow>): Follow {
  return {
    id: UUID1,
    followerId: UUID1,
    followeeId: UUID2,
    createdAt: NOW,
    ...overrides,
  };
}

function makeRepositories(overrides?: Partial<AppRepositories>): AppRepositories {
  return {
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
      moveShelfItem: vi.fn()
    },
    reviews: { findById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    activity: { append: vi.fn(), getFriendFeed: vi.fn(), deleteByReviewId: vi.fn() },
    recommendations: { getForUser: vi.fn() },
    follows: {
      follow: vi.fn().mockResolvedValue(makeFollow()),
      unfollow: vi.fn().mockResolvedValue(undefined),
      findFollow: vi.fn().mockResolvedValue(null),
      listFollowers: vi.fn().mockResolvedValue([]),
      listFollowing: vi.fn().mockResolvedValue([]),
      isMutual: vi.fn().mockResolvedValue(false),
      countMutuals: vi.fn().mockResolvedValue(0),
      ...overrides?.follows,
    },
    blocks: {
      block: vi.fn(),
      unblock: vi.fn(),
      findBlock: vi.fn().mockResolvedValue(null),
      listBlockedByUser: vi.fn().mockResolvedValue([]),
      listBlockingUser: vi.fn().mockResolvedValue([]),
      isBlocked: vi.fn().mockResolvedValue(false),
      ...overrides?.blocks,
    },
    rankings: { upsert: vi.fn(), findById: vi.fn(), findByOwnerAndBook: vi.fn(), listByOwner: vi.fn(), delete: vi.fn(), startBucket: vi.fn() },
    notifications: { registerToken: vi.fn(), removeToken: vi.fn(), listTokensForProfile: vi.fn(), getSetting: vi.fn(), setSetting: vi.fn(), listSettings: vi.fn() },
    imports: { create: vi.fn(), findById: vi.fn(), findByOwnerAndHash: vi.fn(), listByOwner: vi.fn(), updateStatus: vi.fn() },
    contacts: { upsertHashes: vi.fn(), findMatches: vi.fn(), deleteForUser: vi.fn(), deleteExpired: vi.fn(), listByUser: vi.fn() },
      emailIndex: { upsertHashes: vi.fn(), findMatches: vi.fn(), deleteForUser: vi.fn(), deleteExpired: vi.fn(), listByUser: vi.fn() },
    lists: { create: vi.fn(), findById: vi.fn(), listByOwner: vi.fn(), update: vi.fn(), delete: vi.fn(), addItem: vi.fn(), removeItem: vi.fn(), listItems: vi.fn(), reorderItems: vi.fn() },
    authIdentities: { create: vi.fn(), findByProvider: vi.fn(), listByProfile: vi.fn() },
    sessions: { create: vi.fn(), findByTokenHash: vi.fn(), revokeByTokenHash: vi.fn(), revokeAllForProfile: vi.fn() },
    handleHistory: { record: vi.fn(), findCurrentByOldHandle: vi.fn() },
    magicLinks: { create: vi.fn(), findByTokenHash: vi.fn(), markConsumed: vi.fn(), deleteExpiredForEmail: vi.fn() },
    inAppNotifications: { list: vi.fn().mockResolvedValue([]), markRead: vi.fn().mockResolvedValue(undefined), findById: vi.fn() },
    phoneVerifications: { upsert: vi.fn(), findByPhone: vi.fn(), incrementAttempts: vi.fn(), deleteByPhone: vi.fn(), deleteExpired: vi.fn() },
    phoneNumbers: { upsert: vi.fn(), findByProfileId: vi.fn(), findByHash: vi.fn() },
    ...overrides,
  };
}

function makeIdentity(overrides?: Partial<AuthIdentity>): AuthIdentity {
  return {
    userId: UUID1,
    ...overrides,
  };
}

function makeCache(store: Map<string, unknown> = new Map()): Cache {
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null) as Cache["get"],
    set: vi.fn(async (key: string, value: unknown, _ttlMs: number) => { store.set(key, value); }) as Cache["set"],
    del: vi.fn(async (key: string) => { store.delete(key); }),
    mget: vi.fn(async (keys: string[]) => keys.map((k) => store.get(k) ?? null)) as Cache["mget"],
    mset: vi.fn(async (entries: { key: string; value: unknown; ttlMs: number }[]) => {
      for (const e of entries) store.set(e.key, e.value);
    }) as Cache["mset"],
    incr: vi.fn(async (key: string, by: number, _ttlMs: number) => {
      const cur = (store.get(key) as number) ?? 0;
      const next = cur + by;
      store.set(key, next);
      return next;
    }),
  };
}

function buildApp(identity: AuthIdentity | null, repositories: AppRepositories, cache?: Cache) {
  const testRouter = router({ follow: followRouter });
  const app = new Hono();
  const auth = { getCurrentIdentity: async () => identity };
  const deps: TrpcContextDeps = { repositories, auth };
  if (cache) deps.cache = cache;
  app.use(
    "/trpc/*",
    trpcServer({
      router: testRouter,
      createContext: createTrpcContext(deps),
    })
  );
  return app;
}

describe("follow.create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a follow relationship", async () => {
    const follow = makeFollow({ followerId: UUID1, followeeId: UUID2 });
    const repos = makeRepositories({
      follows: {
        ...makeRepositories().follows,
        follow: vi.fn().mockResolvedValue(follow),
        findFollow: vi.fn().mockResolvedValue(null),
      },
    });
    const app = buildApp(makeIdentity({ userId: UUID1 }), repos);
    const res = await app.request("/trpc/follow.create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ followeeId: UUID2 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.follow.followerId).toBe(UUID1);
    expect(body.result.data.follow.followeeId).toBe(UUID2);
  });

  it("is idempotent - returns existing follow if already following", async () => {
    const existingFollow = makeFollow({ followerId: UUID1, followeeId: UUID2 });
    const repos = makeRepositories({
      follows: {
        ...makeRepositories().follows,
        findFollow: vi.fn().mockResolvedValue(existingFollow),
        follow: vi.fn(),
      },
    });
    const app = buildApp(makeIdentity({ userId: UUID1 }), repos);
    const res = await app.request("/trpc/follow.create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ followeeId: UUID2 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.follow.followerId).toBe(UUID1);
    // Should not have called follow() since it already exists
    expect(repos.follows.follow).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    const repos = makeRepositories();
    const app = buildApp(null, repos);
    const res = await app.request("/trpc/follow.create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ followeeId: UUID2 }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 when target has blocked the follower", async () => {
    const block: Block = { id: UUID3, blockerId: UUID2, blockedId: UUID1, createdAt: NOW };
    const repos = makeRepositories({
      blocks: {
        ...makeRepositories().blocks,
        findBlock: vi.fn().mockImplementation(({ blockerId, blockedId }) => {
          if (blockerId === UUID2 && blockedId === UUID1) return Promise.resolve(block);
          return Promise.resolve(null);
        }),
        listBlockedByUser: vi.fn().mockResolvedValue([]),
        listBlockingUser: vi.fn().mockResolvedValue([]),
      },
    });
    const app = buildApp(makeIdentity({ userId: UUID1 }), repos);
    const res = await app.request("/trpc/follow.create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ followeeId: UUID2 }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 403 when the follower has blocked the target", async () => {
    const block: Block = { id: UUID3, blockerId: UUID1, blockedId: UUID2, createdAt: NOW };
    const repos = makeRepositories({
      blocks: {
        ...makeRepositories().blocks,
        findBlock: vi.fn().mockImplementation(({ blockerId, blockedId }) => {
          if (blockerId === UUID1 && blockedId === UUID2) return Promise.resolve(block);
          return Promise.resolve(null);
        }),
        listBlockedByUser: vi.fn().mockResolvedValue([]),
        listBlockingUser: vi.fn().mockResolvedValue([]),
      },
    });
    const app = buildApp(makeIdentity({ userId: UUID1 }), repos);
    const res = await app.request("/trpc/follow.create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ followeeId: UUID2 }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 when trying to follow yourself", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity({ userId: UUID1 }), repos);
    const res = await app.request("/trpc/follow.create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ followeeId: UUID1 }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects invalid followeeId (non-UUID)", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request("/trpc/follow.create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ followeeId: "not-a-uuid" }),
    });
    expect(res.status).toBe(400);
  });

  it("invalidates mutual count cache for both users on create", async () => {
    const follow = makeFollow({ followerId: UUID1, followeeId: UUID2 });
    const repos = makeRepositories({
      follows: {
        ...makeRepositories().follows,
        follow: vi.fn().mockResolvedValue(follow),
        findFollow: vi.fn().mockResolvedValue(null),
      },
    });
    const store = new Map<string, unknown>();
    store.set(`mutual-count:${UUID1}`, 3);
    store.set(`mutual-count:${UUID2}`, 5);
    const cache = makeCache(store);
    const app = buildApp(makeIdentity({ userId: UUID1 }), repos, cache);
    const res = await app.request("/trpc/follow.create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ followeeId: UUID2 }),
    });
    expect(res.status).toBe(200);
    expect(cache.del).toHaveBeenCalledWith(`mutual-count:${UUID1}`);
    expect(cache.del).toHaveBeenCalledWith(`mutual-count:${UUID2}`);
    expect(store.has(`mutual-count:${UUID1}`)).toBe(false);
    expect(store.has(`mutual-count:${UUID2}`)).toBe(false);
  });
});

describe("follow.delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("unfollows a user", async () => {
    const existingFollow = makeFollow({ followerId: UUID1, followeeId: UUID2 });
    const repos = makeRepositories({
      follows: {
        ...makeRepositories().follows,
        findFollow: vi.fn().mockResolvedValue(existingFollow),
        unfollow: vi.fn().mockResolvedValue(undefined),
      },
    });
    const app = buildApp(makeIdentity({ userId: UUID1 }), repos);
    const res = await app.request("/trpc/follow.delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ followeeId: UUID2 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.success).toBe(true);
    expect(repos.follows.unfollow).toHaveBeenCalledWith({
      followerId: UUID1,
      followeeId: UUID2,
    });
  });

  it("is idempotent - succeeds even if not following", async () => {
    const repos = makeRepositories({
      follows: {
        ...makeRepositories().follows,
        findFollow: vi.fn().mockResolvedValue(null),
        unfollow: vi.fn(),
      },
    });
    const app = buildApp(makeIdentity({ userId: UUID1 }), repos);
    const res = await app.request("/trpc/follow.delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ followeeId: UUID2 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.success).toBe(true);
    // Should not have called unfollow since there was nothing to unfollow
    expect(repos.follows.unfollow).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    const repos = makeRepositories();
    const app = buildApp(null, repos);
    const res = await app.request("/trpc/follow.delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ followeeId: UUID2 }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects invalid followeeId (non-UUID)", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request("/trpc/follow.delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ followeeId: "not-a-uuid" }),
    });
    expect(res.status).toBe(400);
  });

  it("invalidates mutual count cache for both users on delete", async () => {
    const existingFollow = makeFollow({ followerId: UUID1, followeeId: UUID2 });
    const repos = makeRepositories({
      follows: {
        ...makeRepositories().follows,
        findFollow: vi.fn().mockResolvedValue(existingFollow),
        unfollow: vi.fn().mockResolvedValue(undefined),
      },
    });
    const store = new Map<string, unknown>();
    store.set(`mutual-count:${UUID1}`, 3);
    store.set(`mutual-count:${UUID2}`, 5);
    const cache = makeCache(store);
    const app = buildApp(makeIdentity({ userId: UUID1 }), repos, cache);
    const res = await app.request("/trpc/follow.delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ followeeId: UUID2 }),
    });
    expect(res.status).toBe(200);
    expect(cache.del).toHaveBeenCalledWith(`mutual-count:${UUID1}`);
    expect(cache.del).toHaveBeenCalledWith(`mutual-count:${UUID2}`);
    expect(store.has(`mutual-count:${UUID1}`)).toBe(false);
    expect(store.has(`mutual-count:${UUID2}`)).toBe(false);
  });
});

describe("follow.list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns followers for a user", async () => {
    const f1 = makeFollow({ id: UUID2, followerId: UUID2, followeeId: UUID1 });
    const f2 = makeFollow({ id: UUID3, followerId: UUID3, followeeId: UUID1 });
    const repos = makeRepositories({
      follows: {
        ...makeRepositories().follows,
        listFollowers: vi.fn().mockResolvedValue([f1, f2]),
      },
    });
    const app = buildApp(makeIdentity({ userId: UUID1 }), repos);
    const res = await app.request(
      `/trpc/follow.list?input=${encodeURIComponent(JSON.stringify({ userId: UUID1, type: "followers", limit: 50 }))}`
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.follows).toHaveLength(2);
    expect(body.result.data.nextCursor).toBeNull();
  });

  it("returns following for a user", async () => {
    const f1 = makeFollow({ id: UUID2, followerId: UUID1, followeeId: UUID2 });
    const repos = makeRepositories({
      follows: {
        ...makeRepositories().follows,
        listFollowing: vi.fn().mockResolvedValue([f1]),
      },
    });
    const app = buildApp(makeIdentity({ userId: UUID1 }), repos);
    const res = await app.request(
      `/trpc/follow.list?input=${encodeURIComponent(JSON.stringify({ userId: UUID1, type: "following", limit: 50 }))}`
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.follows).toHaveLength(1);
  });

  it("filters out blocked users from the list", async () => {
    const f1 = makeFollow({ id: UUID2, followerId: UUID2, followeeId: UUID1 });
    const f2 = makeFollow({ id: UUID3, followerId: UUID3, followeeId: UUID1 });
    const repos = makeRepositories({
      follows: {
        ...makeRepositories().follows,
        listFollowers: vi.fn().mockResolvedValue([f1, f2]),
      },
      blocks: {
        ...makeRepositories().blocks,
        listBlockedByUser: vi.fn().mockResolvedValue([{ id: "b1", blockerId: UUID1, blockedId: UUID3, createdAt: NOW }]),
        listBlockingUser: vi.fn().mockResolvedValue([]),
      },
    });
    const app = buildApp(makeIdentity({ userId: UUID1 }), repos);
    const res = await app.request(
      `/trpc/follow.list?input=${encodeURIComponent(JSON.stringify({ userId: UUID1, type: "followers", limit: 50 }))}`
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // UUID3 should be filtered out since UUID1 blocked UUID3
    expect(body.result.data.follows).toHaveLength(1);
    expect(body.result.data.follows[0].followerId).toBe(UUID2);
  });

  it("paginates with cursor", async () => {
    const follows = Array.from({ length: 5 }, (_, i) =>
      makeFollow({
        id: `00000000-0000-0000-0000-00000000000${i + 1}`,
        followerId: `00000000-0000-0000-0000-00000000000${i + 1}`,
        followeeId: UUID1,
      })
    );
    const repos = makeRepositories({
      follows: {
        ...makeRepositories().follows,
        listFollowers: vi.fn().mockResolvedValue(follows),
      },
    });
    const app = buildApp(makeIdentity({ userId: UUID1 }), repos);

    // Request first 2
    const res1 = await app.request(
      `/trpc/follow.list?input=${encodeURIComponent(JSON.stringify({ userId: UUID1, type: "followers", limit: 2 }))}`
    );
    expect(res1.status).toBe(200);
    const body1 = await res1.json();
    expect(body1.result.data.follows).toHaveLength(2);
    expect(body1.result.data.nextCursor).toBe("00000000-0000-0000-0000-000000000002");

    // Request next page using cursor
    const res2 = await app.request(
      `/trpc/follow.list?input=${encodeURIComponent(JSON.stringify({ userId: UUID1, type: "followers", limit: 2, cursor: "00000000-0000-0000-0000-000000000002" }))}`
    );
    expect(res2.status).toBe(200);
    const body2 = await res2.json();
    expect(body2.result.data.follows).toHaveLength(2);
    expect(body2.result.data.follows[0].id).toBe("00000000-0000-0000-0000-000000000003");
    expect(body2.result.data.nextCursor).toBe("00000000-0000-0000-0000-000000000004");
  });

  it("returns empty array when user has no followers", async () => {
    const repos = makeRepositories({
      follows: {
        ...makeRepositories().follows,
        listFollowers: vi.fn().mockResolvedValue([]),
      },
    });
    const app = buildApp(makeIdentity({ userId: UUID1 }), repos);
    const res = await app.request(
      `/trpc/follow.list?input=${encodeURIComponent(JSON.stringify({ userId: UUID1, type: "followers", limit: 50 }))}`
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.follows).toHaveLength(0);
    expect(body.result.data.nextCursor).toBeNull();
  });

  it("works without authentication (public follower/following lists)", async () => {
    const f1 = makeFollow({ id: UUID2, followerId: UUID2, followeeId: UUID1 });
    const repos = makeRepositories({
      follows: {
        ...makeRepositories().follows,
        listFollowers: vi.fn().mockResolvedValue([f1]),
      },
    });
    const app = buildApp(null, repos);
    const res = await app.request(
      `/trpc/follow.list?input=${encodeURIComponent(JSON.stringify({ userId: UUID1, type: "followers", limit: 50 }))}`
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.follows).toHaveLength(1);
  });

  it("rejects invalid userId (non-UUID)", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request(
      `/trpc/follow.list?input=${encodeURIComponent(JSON.stringify({ userId: "not-a-uuid", type: "followers", limit: 50 }))}`
    );
    expect(res.status).toBe(400);
  });

  it("rejects invalid type value", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request(
      `/trpc/follow.list?input=${encodeURIComponent(JSON.stringify({ userId: UUID1, type: "invalid", limit: 50 }))}`
    );
    expect(res.status).toBe(400);
  });

  it("rejects limit exceeding maximum", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request(
      `/trpc/follow.list?input=${encodeURIComponent(JSON.stringify({ userId: UUID1, type: "followers", limit: 101 }))}`
    );
    expect(res.status).toBe(400);
  });
});

describe("follow.mutualCount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the mutual count for a user", async () => {
    const repos = makeRepositories({
      follows: {
        ...makeRepositories().follows,
        countMutuals: vi.fn().mockResolvedValue(7),
      },
    });
    const app = buildApp(makeIdentity({ userId: UUID1 }), repos);
    const res = await app.request(
      `/trpc/follow.mutualCount?input=${encodeURIComponent(JSON.stringify({ userId: UUID1 }))}`
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.userId).toBe(UUID1);
    expect(body.result.data.count).toBe(7);
  });

  it("returns 0 when user has no mutuals", async () => {
    const repos = makeRepositories({
      follows: {
        ...makeRepositories().follows,
        countMutuals: vi.fn().mockResolvedValue(0),
      },
    });
    const app = buildApp(makeIdentity({ userId: UUID1 }), repos);
    const res = await app.request(
      `/trpc/follow.mutualCount?input=${encodeURIComponent(JSON.stringify({ userId: UUID1 }))}`
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.count).toBe(0);
  });

  it("returns cached value when cache hit", async () => {
    const repos = makeRepositories();
    const store = new Map<string, unknown>();
    store.set(`mutual-count:${UUID1}`, 42);
    const cache = makeCache(store);
    const app = buildApp(makeIdentity({ userId: UUID1 }), repos, cache);
    const res = await app.request(
      `/trpc/follow.mutualCount?input=${encodeURIComponent(JSON.stringify({ userId: UUID1 }))}`
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.count).toBe(42);
    // Should not have called countMutuals since the cache had the value
    expect(repos.follows.countMutuals).not.toHaveBeenCalled();
  });

  it("fetches from repo and caches when cache miss", async () => {
    const repos = makeRepositories({
      follows: {
        ...makeRepositories().follows,
        countMutuals: vi.fn().mockResolvedValue(10),
      },
    });
    const store = new Map<string, unknown>();
    const cache = makeCache(store);
    const app = buildApp(makeIdentity({ userId: UUID1 }), repos, cache);
    const res = await app.request(
      `/trpc/follow.mutualCount?input=${encodeURIComponent(JSON.stringify({ userId: UUID1 }))}`
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.count).toBe(10);
    expect(repos.follows.countMutuals).toHaveBeenCalledWith(UUID1);
    expect(cache.set).toHaveBeenCalledWith(`mutual-count:${UUID1}`, 10, 300000);
    expect(store.get(`mutual-count:${UUID1}`)).toBe(10);
  });

  it("works without authentication", async () => {
    const repos = makeRepositories({
      follows: {
        ...makeRepositories().follows,
        countMutuals: vi.fn().mockResolvedValue(3),
      },
    });
    const app = buildApp(null, repos);
    const res = await app.request(
      `/trpc/follow.mutualCount?input=${encodeURIComponent(JSON.stringify({ userId: UUID1 }))}`
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.count).toBe(3);
  });

  it("rejects invalid userId (non-UUID)", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request(
      `/trpc/follow.mutualCount?input=${encodeURIComponent(JSON.stringify({ userId: "not-a-uuid" }))}`
    );
    expect(res.status).toBe(400);
  });
});
