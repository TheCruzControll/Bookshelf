import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { trpcServer } from "@hono/trpc-server";
import { createTrpcContext, type TrpcContextDeps } from "./context";
import { router } from "./trpc";
import { blockRouter } from "./block";
import type { AppRepositories, AuthIdentity, Block } from "@hone/domain";
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

function makeBlock(overrides?: Partial<Block>): Block {
  return {
    id: UUID3,
    blockerId: UUID1,
    blockedId: UUID2,
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
      moveShelfItem: vi.fn(),
    },
    reviews: { findById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    activity: { append: vi.fn(), getFriendFeed: vi.fn(), deleteByReviewId: vi.fn() },
    recommendations: { getForUser: vi.fn() },
    follows: {
      follow: vi.fn(),
      unfollow: vi.fn().mockResolvedValue(undefined),
      findFollow: vi.fn().mockResolvedValue(null),
      listFollowers: vi.fn().mockResolvedValue([]),
      listFollowing: vi.fn().mockResolvedValue([]),
      isMutual: vi.fn().mockResolvedValue(false),
      countMutuals: vi.fn().mockResolvedValue(0),
      ...overrides?.follows,
    },
    blocks: {
      block: vi.fn().mockResolvedValue(makeBlock()),
      unblock: vi.fn().mockResolvedValue(undefined),
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
  const testRouter = router({ block: blockRouter });
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

describe("block.create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a block and severs follows in both directions", async () => {
    const block = makeBlock({ blockerId: UUID1, blockedId: UUID2 });
    const repos = makeRepositories({
      blocks: {
        ...makeRepositories().blocks,
        block: vi.fn().mockResolvedValue(block),
        findBlock: vi.fn().mockResolvedValue(null),
      },
    });
    const app = buildApp(makeIdentity({ userId: UUID1 }), repos);
    const res = await app.request("/trpc/block.create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blockedId: UUID2 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.block.blockerId).toBe(UUID1);
    expect(body.result.data.block.blockedId).toBe(UUID2);
    // Verify unfollow was called in both directions
    expect(repos.follows.unfollow).toHaveBeenCalledWith({
      followerId: UUID1,
      followeeId: UUID2,
    });
    expect(repos.follows.unfollow).toHaveBeenCalledWith({
      followerId: UUID2,
      followeeId: UUID1,
    });
  });

  it("is idempotent - returns existing block if already blocked", async () => {
    const existingBlock = makeBlock({ blockerId: UUID1, blockedId: UUID2 });
    const repos = makeRepositories({
      blocks: {
        ...makeRepositories().blocks,
        findBlock: vi.fn().mockResolvedValue(existingBlock),
        block: vi.fn(),
      },
    });
    const app = buildApp(makeIdentity({ userId: UUID1 }), repos);
    const res = await app.request("/trpc/block.create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blockedId: UUID2 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.block.blockerId).toBe(UUID1);
    // Should not have called block() since it already exists
    expect(repos.blocks.block).not.toHaveBeenCalled();
    // Should not have called unfollow since block already exists
    expect(repos.follows.unfollow).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    const repos = makeRepositories();
    const app = buildApp(null, repos);
    const res = await app.request("/trpc/block.create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blockedId: UUID2 }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 when trying to block yourself", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity({ userId: UUID1 }), repos);
    const res = await app.request("/trpc/block.create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blockedId: UUID1 }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects invalid blockedId (non-UUID)", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request("/trpc/block.create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blockedId: "not-a-uuid" }),
    });
    expect(res.status).toBe(400);
  });

  it("invalidates mutual count cache for both users on create", async () => {
    const block = makeBlock({ blockerId: UUID1, blockedId: UUID2 });
    const repos = makeRepositories({
      blocks: {
        ...makeRepositories().blocks,
        block: vi.fn().mockResolvedValue(block),
        findBlock: vi.fn().mockResolvedValue(null),
      },
    });
    const store = new Map<string, unknown>();
    store.set(`mutual-count:${UUID1}`, 3);
    store.set(`mutual-count:${UUID2}`, 5);
    const cache = makeCache(store);
    const app = buildApp(makeIdentity({ userId: UUID1 }), repos, cache);
    const res = await app.request("/trpc/block.create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blockedId: UUID2 }),
    });
    expect(res.status).toBe(200);
    expect(cache.del).toHaveBeenCalledWith(`mutual-count:${UUID1}`);
    expect(cache.del).toHaveBeenCalledWith(`mutual-count:${UUID2}`);
    expect(store.has(`mutual-count:${UUID1}`)).toBe(false);
    expect(store.has(`mutual-count:${UUID2}`)).toBe(false);
  });
});

describe("block.delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("unblocks a user", async () => {
    const existingBlock = makeBlock({ blockerId: UUID1, blockedId: UUID2 });
    const repos = makeRepositories({
      blocks: {
        ...makeRepositories().blocks,
        findBlock: vi.fn().mockResolvedValue(existingBlock),
        unblock: vi.fn().mockResolvedValue(undefined),
      },
    });
    const app = buildApp(makeIdentity({ userId: UUID1 }), repos);
    const res = await app.request("/trpc/block.delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blockedId: UUID2 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.success).toBe(true);
    expect(repos.blocks.unblock).toHaveBeenCalledWith({
      blockerId: UUID1,
      blockedId: UUID2,
    });
  });

  it("does not auto-restore follows on unblock", async () => {
    const existingBlock = makeBlock({ blockerId: UUID1, blockedId: UUID2 });
    const repos = makeRepositories({
      blocks: {
        ...makeRepositories().blocks,
        findBlock: vi.fn().mockResolvedValue(existingBlock),
        unblock: vi.fn().mockResolvedValue(undefined),
      },
    });
    const app = buildApp(makeIdentity({ userId: UUID1 }), repos);
    const res = await app.request("/trpc/block.delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blockedId: UUID2 }),
    });
    expect(res.status).toBe(200);
    // Follow should NOT be called -- no auto-restore
    expect(repos.follows.follow).not.toHaveBeenCalled();
  });

  it("is idempotent - succeeds even if not blocked", async () => {
    const repos = makeRepositories({
      blocks: {
        ...makeRepositories().blocks,
        findBlock: vi.fn().mockResolvedValue(null),
        unblock: vi.fn(),
      },
    });
    const app = buildApp(makeIdentity({ userId: UUID1 }), repos);
    const res = await app.request("/trpc/block.delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blockedId: UUID2 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.success).toBe(true);
    // Should not have called unblock since there was nothing to unblock
    expect(repos.blocks.unblock).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    const repos = makeRepositories();
    const app = buildApp(null, repos);
    const res = await app.request("/trpc/block.delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blockedId: UUID2 }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects invalid blockedId (non-UUID)", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request("/trpc/block.delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blockedId: "not-a-uuid" }),
    });
    expect(res.status).toBe(400);
  });
});
