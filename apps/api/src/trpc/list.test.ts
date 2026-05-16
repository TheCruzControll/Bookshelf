import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { trpcServer } from "@hono/trpc-server";
import { createTrpcContext } from "./context";
import { router } from "./trpc";
import { listRouter } from "./list";
import type { AppRepositories, AuthIdentity, Shelf } from "@hone/domain";

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

function makeShelf(overrides?: Partial<Shelf>): Shelf {
  return {
    id: UUID1,
    ownerId: UUID1,
    name: "My List",
    slug: "my-list",
    visibility: "public",
    isSystem: false,
    kind: "list",
    authorType: "user",
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as Shelf;
}

function makeRepositories(overrides?: Partial<AppRepositories>): AppRepositories {
  return {
    accountDeletions: { create: vi.fn(), findByProfileId: vi.fn().mockResolvedValue(null), delete: vi.fn() },
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
      update: vi.fn().mockResolvedValue(makeShelf()),
      delete: vi.fn().mockResolvedValue(undefined),
      addBook: vi.fn(),
      rankShelfItem: vi.fn(),
      createSystemShelves: vi.fn(),
      findShelfItem: vi.fn(),
      upsertShelfItem: vi.fn(),
      deleteShelfItem: vi.fn(),
      getMaxPosition: vi.fn().mockResolvedValue(0),
      moveShelfItem: vi.fn(),
      ...overrides?.shelves,
    },
    reviews: { findById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    activity: { append: vi.fn(), getFriendFeed: vi.fn(), getFriendFeedGrouped: vi.fn(), deleteByReviewId: vi.fn() },
    recommendations: { getForUser: vi.fn() },
    follows: { follow: vi.fn(), unfollow: vi.fn(), findFollow: vi.fn(), listFollowers: vi.fn(), listFollowing: vi.fn(), isMutual: vi.fn(), countMutuals: vi.fn() },
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
    inAppNotifications: { list: vi.fn().mockResolvedValue([]), markRead: vi.fn().mockResolvedValue(undefined), findById: vi.fn(), countSince: vi.fn().mockResolvedValue(0), countSinceByActor: vi.fn().mockResolvedValue(0) },
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
  const testRouter = router({ list: listRouter });
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

describe("list.publish", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("publishes a list shelf and sets publishedAt", async () => {
    const existing = makeShelf({ id: UUID2, ownerId: UUID1, kind: "list" });
    const published = makeShelf({ id: UUID2, ownerId: UUID1, kind: "list", publishedAt: NOW });
    const repos = makeRepositories({
      shelves: {
        ...makeRepositories().shelves,
        findById: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(published),
      },
    });
    const app = buildApp(makeIdentity({ userId: UUID1 }), repos);
    const res = await app.request("/trpc/list.publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: UUID2, version: 1 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.shelf.publishedAt).toBeTruthy();
    expect(repos.shelves.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: UUID2,
        ownerId: UUID1,
        version: 1,
        publishedAt: expect.any(Date),
      })
    );
  });

  it("returns 401 when unauthenticated", async () => {
    const repos = makeRepositories();
    const app = buildApp(null, repos);
    const res = await app.request("/trpc/list.publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: UUID2, version: 1 }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when shelf does not exist", async () => {
    const repos = makeRepositories({
      shelves: {
        ...makeRepositories().shelves,
        findById: vi.fn().mockResolvedValue(null),
      },
    });
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request("/trpc/list.publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: UUID2, version: 1 }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 403 when user is not the owner", async () => {
    const existing = makeShelf({ id: UUID2, ownerId: UUID3, kind: "list" });
    const repos = makeRepositories({
      shelves: {
        ...makeRepositories().shelves,
        findById: vi.fn().mockResolvedValue(existing),
      },
    });
    const app = buildApp(makeIdentity({ userId: UUID1 }), repos);
    const res = await app.request("/trpc/list.publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: UUID2, version: 1 }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 when shelf kind is not list", async () => {
    const existing = makeShelf({ id: UUID2, ownerId: UUID1, kind: "custom" });
    const repos = makeRepositories({
      shelves: {
        ...makeRepositories().shelves,
        findById: vi.fn().mockResolvedValue(existing),
      },
    });
    const app = buildApp(makeIdentity({ userId: UUID1 }), repos);
    const res = await app.request("/trpc/list.publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: UUID2, version: 1 }),
    });
    expect(res.status).toBe(400);
  });

  it("is idempotent when list is already published", async () => {
    const existing = makeShelf({ id: UUID2, ownerId: UUID1, kind: "list", publishedAt: NOW });
    const repos = makeRepositories({
      shelves: {
        ...makeRepositories().shelves,
        findById: vi.fn().mockResolvedValue(existing),
      },
    });
    const app = buildApp(makeIdentity({ userId: UUID1 }), repos);
    const res = await app.request("/trpc/list.publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: UUID2, version: 1 }),
    });
    expect(res.status).toBe(200);
    // Should not call update since it's already published
    expect(repos.shelves.update).not.toHaveBeenCalled();
  });

  it("returns 403 when authorType is internal_editorial and profile is not verified", async () => {
    const existing = makeShelf({ id: UUID2, ownerId: UUID1, kind: "list" });
    const repos = makeRepositories({
      shelves: {
        ...makeRepositories().shelves,
        findById: vi.fn().mockResolvedValue(existing),
      },
      profiles: {
        ...makeRepositories().profiles,
        findById: vi.fn().mockResolvedValue({
          id: UUID1,
          handle: "testuser",
          displayName: "Test User",
          verified: false,
          defaultVisibility: {},
          version: 1,
          createdAt: NOW,
          updatedAt: NOW,
        }),
      },
    });
    const app = buildApp(makeIdentity({ userId: UUID1 }), repos);
    const res = await app.request("/trpc/list.publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: UUID2, version: 1, authorType: "internal_editorial" }),
    });
    expect(res.status).toBe(403);
  });

  it("publishes with internal_editorial when profile is verified", async () => {
    const existing = makeShelf({ id: UUID2, ownerId: UUID1, kind: "list" });
    const published = makeShelf({ id: UUID2, ownerId: UUID1, kind: "list", authorType: "internal_editorial", publishedAt: NOW });
    const repos = makeRepositories({
      shelves: {
        ...makeRepositories().shelves,
        findById: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(published),
      },
      profiles: {
        ...makeRepositories().profiles,
        findById: vi.fn().mockResolvedValue({
          id: UUID1,
          handle: "testuser",
          displayName: "Test User",
          verified: true,
          defaultVisibility: {},
          version: 1,
          createdAt: NOW,
          updatedAt: NOW,
        }),
      },
    });
    const app = buildApp(makeIdentity({ userId: UUID1 }), repos);
    const res = await app.request("/trpc/list.publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: UUID2, version: 1, authorType: "internal_editorial" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.shelf.authorType).toBe("internal_editorial");
  });
});

describe("list.unpublish", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("unpublishes a list shelf and clears publishedAt", async () => {
    const existing = makeShelf({ id: UUID2, ownerId: UUID1, kind: "list", publishedAt: NOW });
    const unpublished = makeShelf({ id: UUID2, ownerId: UUID1, kind: "list" });
    const repos = makeRepositories({
      shelves: {
        ...makeRepositories().shelves,
        findById: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(unpublished),
      },
    });
    const app = buildApp(makeIdentity({ userId: UUID1 }), repos);
    const res = await app.request("/trpc/list.unpublish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: UUID2, version: 1 }),
    });
    expect(res.status).toBe(200);
    expect(repos.shelves.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: UUID2,
        ownerId: UUID1,
        version: 1,
        publishedAt: null,
      })
    );
  });

  it("returns 401 when unauthenticated", async () => {
    const repos = makeRepositories();
    const app = buildApp(null, repos);
    const res = await app.request("/trpc/list.unpublish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: UUID2, version: 1 }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when shelf does not exist", async () => {
    const repos = makeRepositories({
      shelves: {
        ...makeRepositories().shelves,
        findById: vi.fn().mockResolvedValue(null),
      },
    });
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request("/trpc/list.unpublish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: UUID2, version: 1 }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 403 when user is not the owner", async () => {
    const existing = makeShelf({ id: UUID2, ownerId: UUID3, kind: "list", publishedAt: NOW });
    const repos = makeRepositories({
      shelves: {
        ...makeRepositories().shelves,
        findById: vi.fn().mockResolvedValue(existing),
      },
    });
    const app = buildApp(makeIdentity({ userId: UUID1 }), repos);
    const res = await app.request("/trpc/list.unpublish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: UUID2, version: 1 }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 when shelf kind is not list", async () => {
    const existing = makeShelf({ id: UUID2, ownerId: UUID1, kind: "custom", publishedAt: NOW });
    const repos = makeRepositories({
      shelves: {
        ...makeRepositories().shelves,
        findById: vi.fn().mockResolvedValue(existing),
      },
    });
    const app = buildApp(makeIdentity({ userId: UUID1 }), repos);
    const res = await app.request("/trpc/list.unpublish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: UUID2, version: 1 }),
    });
    expect(res.status).toBe(400);
  });

  it("is idempotent when list is already unpublished", async () => {
    const existing = makeShelf({ id: UUID2, ownerId: UUID1, kind: "list" });
    const repos = makeRepositories({
      shelves: {
        ...makeRepositories().shelves,
        findById: vi.fn().mockResolvedValue(existing),
      },
    });
    const app = buildApp(makeIdentity({ userId: UUID1 }), repos);
    const res = await app.request("/trpc/list.unpublish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: UUID2, version: 1 }),
    });
    expect(res.status).toBe(200);
    // Should not call update since it's already unpublished
    expect(repos.shelves.update).not.toHaveBeenCalled();
  });
});
