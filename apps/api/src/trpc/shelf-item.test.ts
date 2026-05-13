import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { trpcServer } from "@hono/trpc-server";
import { createTrpcContext } from "./context";
import { router } from "./trpc";
import { shelfItemRouter } from "./shelf-item";
import type { AppRepositories, AuthIdentity, Shelf, ShelfItem } from "@hone/domain";

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

function makeShelf(overrides?: Partial<Shelf>): Shelf {
  return {
    id: UUID2,
    ownerId: UUID1,
    name: "My Shelf",
    slug: "my-shelf",
    visibility: "public",
    isSystem: false,
    kind: "custom",
    authorType: "user",
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as Shelf;
}

function makeShelfItem(overrides?: Partial<ShelfItem>): ShelfItem {
  return {
    id: UUID4,
    shelfId: UUID2,
    bookId: UUID3,
    status: "want_to_read",
    notes: undefined,
    position: 0,
    addedAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as ShelfItem;
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
      findById: vi.fn().mockResolvedValue(makeShelf()),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      addBook: vi.fn(),
      rankShelfItem: vi.fn(),
      createSystemShelves: vi.fn(),
      findShelfItem: vi.fn().mockResolvedValue(null),
      upsertShelfItem: vi.fn().mockResolvedValue(makeShelfItem()),
      deleteShelfItem: vi.fn().mockResolvedValue(undefined),
      getMaxPosition: vi.fn().mockResolvedValue(0),
      moveShelfItem: vi.fn().mockResolvedValue(makeShelfItem()),
      ...overrides?.shelves,
    },
    reviews: { findById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    activity: { append: vi.fn(), getFriendFeed: vi.fn(), getFriendFeedGrouped: vi.fn(), deleteByReviewId: vi.fn() },
    recommendations: { getForUser: vi.fn() },
    follows: { follow: vi.fn(), unfollow: vi.fn(), findFollow: vi.fn(), listFollowers: vi.fn(), listFollowing: vi.fn(), isMutual: vi.fn(), countMutuals: vi.fn().mockResolvedValue(0) },
    blocks: { block: vi.fn(), unblock: vi.fn(), findBlock: vi.fn(), listBlockedByUser: vi.fn(), listBlockingUser: vi.fn(), isBlocked: vi.fn() },
    rankings: { upsert: vi.fn(), findById: vi.fn(), findByOwnerAndBook: vi.fn(), listByOwner: vi.fn(), delete: vi.fn(), startBucket: vi.fn() },
    notifications: { registerToken: vi.fn(), removeToken: vi.fn(), listTokensForProfile: vi.fn(), getSetting: vi.fn(), setSetting: vi.fn(), listSettings: vi.fn() },
    imports: { create: vi.fn(), findById: vi.fn(), findByOwnerAndHash: vi.fn(), listByOwner: vi.fn(), updateStatus: vi.fn() },
    contacts: { upsertHashes: vi.fn(), findMatches: vi.fn(), deleteForUser: vi.fn(), deleteExpired: vi.fn(), expireBySaltVersion: vi.fn(), deleteByTargetHash: vi.fn(), listByUser: vi.fn() },
    lists: { create: vi.fn(), findById: vi.fn(), listByOwner: vi.fn(), update: vi.fn(), delete: vi.fn(), addItem: vi.fn(), removeItem: vi.fn(), listItems: vi.fn(), reorderItems: vi.fn() },
    authIdentities: { create: vi.fn(), findByProvider: vi.fn(), listByProfile: vi.fn() },
    sessions: { create: vi.fn(), findByTokenHash: vi.fn(), revokeByTokenHash: vi.fn(), revokeAllForProfile: vi.fn() },
    handleHistory: { record: vi.fn(), findCurrentByOldHandle: vi.fn() },
    magicLinks: { create: vi.fn(), findByTokenHash: vi.fn(), markConsumed: vi.fn(), deleteExpiredForEmail: vi.fn() },
    emailIndex: { upsertHashes: vi.fn(), findMatches: vi.fn(), deleteForUser: vi.fn(), deleteExpired: vi.fn(), expireBySaltVersion: vi.fn(), deleteByTargetHash: vi.fn(), listByUser: vi.fn() },
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
  const testRouter = router({ shelfItem: shelfItemRouter });
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

describe("shelfItem.upsert", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("upserts a shelf item with notes and auto-appended position", async () => {
    const item = makeShelfItem({ notes: "Great read", position: 1 });
    const repos = makeRepositories({
      shelves: {
        ...makeRepositories().shelves,
        findById: vi.fn().mockResolvedValue(makeShelf()),
        getMaxPosition: vi.fn().mockResolvedValue(0),
        upsertShelfItem: vi.fn().mockResolvedValue(item),
      },
    });
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request("/trpc/shelfItem.upsert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shelfId: UUID2, bookId: UUID3, notes: "Great read" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.shelfItem.notes).toBe("Great read");
    expect(body.result.data.shelfItem.position).toBe(1);
  });

  it("upserts a shelf item with explicit position", async () => {
    const item = makeShelfItem({ position: 5 });
    const repos = makeRepositories({
      shelves: {
        ...makeRepositories().shelves,
        findById: vi.fn().mockResolvedValue(makeShelf()),
        upsertShelfItem: vi.fn().mockResolvedValue(item),
      },
    });
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request("/trpc/shelfItem.upsert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shelfId: UUID2, bookId: UUID3, position: 5 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.shelfItem.position).toBe(5);
  });

  it("returns 401 when unauthenticated", async () => {
    const repos = makeRepositories();
    const app = buildApp(null, repos);
    const res = await app.request("/trpc/shelfItem.upsert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shelfId: UUID2, bookId: UUID3 }),
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
    const res = await app.request("/trpc/shelfItem.upsert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shelfId: UUID2, bookId: UUID3 }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 403 when user is not the shelf owner", async () => {
    const repos = makeRepositories({
      shelves: {
        ...makeRepositories().shelves,
        findById: vi.fn().mockResolvedValue(makeShelf({ ownerId: UUID3 })),
      },
    });
    const app = buildApp(makeIdentity({ userId: UUID1 }), repos);
    const res = await app.request("/trpc/shelfItem.upsert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shelfId: UUID2, bookId: UUID3 }),
    });
    expect(res.status).toBe(403);
  });

  it("defaults position to append (max + 1) when not provided", async () => {
    const repos = makeRepositories({
      shelves: {
        ...makeRepositories().shelves,
        findById: vi.fn().mockResolvedValue(makeShelf()),
        getMaxPosition: vi.fn().mockResolvedValue(3),
        upsertShelfItem: vi.fn().mockResolvedValue(makeShelfItem({ position: 4 })),
      },
    });
    const app = buildApp(makeIdentity(), repos);
    await app.request("/trpc/shelfItem.upsert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shelfId: UUID2, bookId: UUID3 }),
    });
    expect(repos.shelves.upsertShelfItem).toHaveBeenCalledWith(
      expect.objectContaining({ position: 4 })
    );
  });
});

describe("shelfItem.move", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("moves a shelf item to a new position", async () => {
    const item = makeShelfItem({ position: 2 });
    const repos = makeRepositories({
      shelves: {
        ...makeRepositories().shelves,
        findById: vi.fn().mockResolvedValue(makeShelf()),
        findShelfItem: vi.fn().mockResolvedValue(makeShelfItem()),
        moveShelfItem: vi.fn().mockResolvedValue(item),
      },
    });
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request("/trpc/shelfItem.move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shelfId: UUID2, bookId: UUID3, position: 2 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.shelfItem.position).toBe(2);
  });

  it("returns 401 when unauthenticated", async () => {
    const repos = makeRepositories();
    const app = buildApp(null, repos);
    const res = await app.request("/trpc/shelfItem.move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shelfId: UUID2, bookId: UUID3, position: 1 }),
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
    const res = await app.request("/trpc/shelfItem.move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shelfId: UUID2, bookId: UUID3, position: 1 }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 403 when user is not the shelf owner", async () => {
    const repos = makeRepositories({
      shelves: {
        ...makeRepositories().shelves,
        findById: vi.fn().mockResolvedValue(makeShelf({ ownerId: UUID3 })),
      },
    });
    const app = buildApp(makeIdentity({ userId: UUID1 }), repos);
    const res = await app.request("/trpc/shelfItem.move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shelfId: UUID2, bookId: UUID3, position: 1 }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 404 when shelf item does not exist", async () => {
    const repos = makeRepositories({
      shelves: {
        ...makeRepositories().shelves,
        findById: vi.fn().mockResolvedValue(makeShelf()),
        findShelfItem: vi.fn().mockResolvedValue(null),
      },
    });
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request("/trpc/shelfItem.move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shelfId: UUID2, bookId: UUID3, position: 1 }),
    });
    expect(res.status).toBe(404);
  });
});

describe("shelfItem.delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes a shelf item", async () => {
    const repos = makeRepositories({
      shelves: {
        ...makeRepositories().shelves,
        findById: vi.fn().mockResolvedValue(makeShelf()),
        deleteShelfItem: vi.fn().mockResolvedValue(undefined),
      },
    });
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request("/trpc/shelfItem.delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shelfId: UUID2, bookId: UUID3 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.success).toBe(true);
  });

  it("returns 401 when unauthenticated", async () => {
    const repos = makeRepositories();
    const app = buildApp(null, repos);
    const res = await app.request("/trpc/shelfItem.delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shelfId: UUID2, bookId: UUID3 }),
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
    const res = await app.request("/trpc/shelfItem.delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shelfId: UUID2, bookId: UUID3 }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 403 when user is not the shelf owner", async () => {
    const repos = makeRepositories({
      shelves: {
        ...makeRepositories().shelves,
        findById: vi.fn().mockResolvedValue(makeShelf({ ownerId: UUID3 })),
      },
    });
    const app = buildApp(makeIdentity({ userId: UUID1 }), repos);
    const res = await app.request("/trpc/shelfItem.delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shelfId: UUID2, bookId: UUID3 }),
    });
    expect(res.status).toBe(403);
  });
});
