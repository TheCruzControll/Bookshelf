import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { trpcServer } from "@hono/trpc-server";
import { createTrpcContext } from "./context";
import { router } from "./trpc";
import { shelfRouter } from "./shelf";
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
    books: { findBookById: vi.fn(), findEditionByIsbn: vi.fn(), findBookByIsbn13: vi.fn().mockResolvedValue(null), search: vi.fn(), upsertFromCatalogResult: vi.fn(), createManual: vi.fn() },
    shelves: {
      listShelves: vi.fn().mockResolvedValue([]),
      findById: vi.fn(),
      create: vi.fn().mockResolvedValue(makeShelf()),
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
      listOwnersWithBookOnSystemShelf: vi.fn().mockResolvedValue([]),
      listShelfItemsByOwner: vi.fn().mockResolvedValue([]),
      ...overrides?.shelves,
    },
    reviews: { findById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), listByAuthor: vi.fn().mockResolvedValue([]) },
    activity: { append: vi.fn(), getFriendFeed: vi.fn(), getFriendFeedGrouped: vi.fn(), deleteByReviewId: vi.fn(), listByActor: vi.fn().mockResolvedValue([]) },
    recommendations: { getForUser: vi.fn() },
    follows: { follow: vi.fn(), unfollow: vi.fn(), findFollow: vi.fn(), listFollowers: vi.fn(), listFollowing: vi.fn(), isMutual: vi.fn(), countMutuals: vi.fn(), listMutualIds: vi.fn().mockResolvedValue([]) },
    blocks: { block: vi.fn(), unblock: vi.fn(), findBlock: vi.fn(), listBlockedByUser: vi.fn(), listBlockingUser: vi.fn(), isBlocked: vi.fn() },
    rankings: { upsert: vi.fn(), findById: vi.fn(), findByOwnerAndBook: vi.fn(), listByOwner: vi.fn(), delete: vi.fn(), startBucket: vi.fn() },
    notifications: { registerToken: vi.fn(), removeToken: vi.fn(), listTokensForProfile: vi.fn(), getSetting: vi.fn(), setSetting: vi.fn(), listSettings: vi.fn() },
    imports: { create: vi.fn(), findById: vi.fn(), findByOwnerAndHash: vi.fn(), listByOwner: vi.fn(), updateStatus: vi.fn() },
    contacts: { upsertHashes: vi.fn(), findMatches: vi.fn(), findMatchingProfilesByPhone: vi.fn(), deleteForUser: vi.fn(), deleteExpired: vi.fn(), expireBySaltVersion: vi.fn(), deleteByTargetHash: vi.fn(), listByUser: vi.fn(), softDisable: vi.fn(), purgeOlderThan: vi.fn().mockResolvedValue(0) },
    emailIndex: { upsertHashes: vi.fn(), findMatches: vi.fn(), deleteForUser: vi.fn(), deleteExpired: vi.fn(), expireBySaltVersion: vi.fn(), deleteByTargetHash: vi.fn(), listByUser: vi.fn() },
    lists: { create: vi.fn(), findById: vi.fn(), listByOwner: vi.fn(), update: vi.fn(), delete: vi.fn(), addItem: vi.fn(), removeItem: vi.fn(), listItems: vi.fn(), reorderItems: vi.fn() },
    authIdentities: { create: vi.fn(), findByProvider: vi.fn(), listByProfile: vi.fn() },
    sessions: { create: vi.fn(), findByTokenHash: vi.fn(), revokeByTokenHash: vi.fn(), revokeAllForProfile: vi.fn() },
    handleHistory: { record: vi.fn(), findCurrentByOldHandle: vi.fn() },
    magicLinks: { create: vi.fn(), findByTokenHash: vi.fn(), markConsumed: vi.fn(), deleteExpiredForEmail: vi.fn() },
    inAppNotifications: { list: vi.fn().mockResolvedValue([]), markRead: vi.fn().mockResolvedValue(undefined), findById: vi.fn(), countSince: vi.fn().mockResolvedValue(0), countSinceByActor: vi.fn().mockResolvedValue(0), create: vi.fn(), listAllByRecipient: vi.fn().mockResolvedValue([]) },
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
  const testRouter = router({ shelf: shelfRouter });
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

describe("shelf.create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a custom shelf with public visibility by default", async () => {
    const shelf = makeShelf({ id: UUID1, ownerId: UUID1, name: "Reading List", slug: "reading-list", visibility: "public" });
    const repos = makeRepositories({
      shelves: {
        ...makeRepositories().shelves,
        create: vi.fn().mockResolvedValue(shelf),
      },
    });
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request("/trpc/shelf.create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Reading List", visibility: "public" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.shelf.name).toBe("Reading List");
    expect(body.result.data.shelf.visibility).toBe("public");
  });

  it("creates a shelf with followers visibility", async () => {
    const shelf = makeShelf({ visibility: "followers" });
    const repos = makeRepositories({
      shelves: {
        ...makeRepositories().shelves,
        create: vi.fn().mockResolvedValue(shelf),
      },
    });
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request("/trpc/shelf.create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "My Shelf", visibility: "followers" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.shelf.visibility).toBe("followers");
  });

  it("uses the authenticated user's id as ownerId", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity({ userId: UUID1 }), repos);
    await app.request("/trpc/shelf.create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "My Shelf" }),
    });
    expect(repos.shelves.create).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: UUID1 })
    );
  });

  it("returns 401 when unauthenticated", async () => {
    const repos = makeRepositories();
    const app = buildApp(null, repos);
    const res = await app.request("/trpc/shelf.create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "My Shelf" }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects a shelf name that is empty", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request("/trpc/shelf.create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects a shelf name exceeding 100 characters", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request("/trpc/shelf.create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "a".repeat(101) }),
    });
    expect(res.status).toBe(400);
  });
});

describe("shelf.update", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates a shelf's name and visibility", async () => {
    const existing = makeShelf({ id: UUID2, ownerId: UUID1 });
    const updated = makeShelf({ id: UUID2, ownerId: UUID1, name: "Updated", visibility: "private" });
    const repos = makeRepositories({
      shelves: {
        ...makeRepositories().shelves,
        findById: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    });
    const app = buildApp(makeIdentity({ userId: UUID1 }), repos);
    const res = await app.request("/trpc/shelf.update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: UUID2, version: 1, name: "Updated", visibility: "private" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.shelf.name).toBe("Updated");
    expect(body.result.data.shelf.visibility).toBe("private");
  });

  it("returns 401 when unauthenticated", async () => {
    const repos = makeRepositories();
    const app = buildApp(null, repos);
    const res = await app.request("/trpc/shelf.update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: UUID2, version: 1, name: "Updated" }),
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
    const res = await app.request("/trpc/shelf.update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: UUID2, version: 1, name: "Updated" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 403 when user is not the owner", async () => {
    const existing = makeShelf({ id: UUID2, ownerId: UUID3 });
    const repos = makeRepositories({
      shelves: {
        ...makeRepositories().shelves,
        findById: vi.fn().mockResolvedValue(existing),
      },
    });
    const app = buildApp(makeIdentity({ userId: UUID1 }), repos);
    const res = await app.request("/trpc/shelf.update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: UUID2, version: 1, name: "Updated" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 403 when trying to modify a system shelf", async () => {
    const systemShelf = makeShelf({ id: UUID2, ownerId: UUID1, isSystem: true });
    const repos = makeRepositories({
      shelves: {
        ...makeRepositories().shelves,
        findById: vi.fn().mockResolvedValue(systemShelf),
      },
    });
    const app = buildApp(makeIdentity({ userId: UUID1 }), repos);
    const res = await app.request("/trpc/shelf.update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: UUID2, version: 1, name: "Updated" }),
    });
    expect(res.status).toBe(403);
  });
});

describe("shelf.delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes a shelf owned by the authenticated user", async () => {
    const existing = makeShelf({ id: UUID2, ownerId: UUID1 });
    const repos = makeRepositories({
      shelves: {
        ...makeRepositories().shelves,
        findById: vi.fn().mockResolvedValue(existing),
        delete: vi.fn().mockResolvedValue(undefined),
      },
    });
    const app = buildApp(makeIdentity({ userId: UUID1 }), repos);
    const res = await app.request("/trpc/shelf.delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: UUID2 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.success).toBe(true);
  });

  it("returns 401 when unauthenticated", async () => {
    const repos = makeRepositories();
    const app = buildApp(null, repos);
    const res = await app.request("/trpc/shelf.delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: UUID2 }),
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
    const res = await app.request("/trpc/shelf.delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: UUID2 }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 403 when user is not the owner", async () => {
    const existing = makeShelf({ id: UUID2, ownerId: UUID3 });
    const repos = makeRepositories({
      shelves: {
        ...makeRepositories().shelves,
        findById: vi.fn().mockResolvedValue(existing),
      },
    });
    const app = buildApp(makeIdentity({ userId: UUID1 }), repos);
    const res = await app.request("/trpc/shelf.delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: UUID2 }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 403 when trying to delete a system shelf", async () => {
    const systemShelf = makeShelf({ id: UUID2, ownerId: UUID1, isSystem: true });
    const repos = makeRepositories({
      shelves: {
        ...makeRepositories().shelves,
        findById: vi.fn().mockResolvedValue(systemShelf),
      },
    });
    const app = buildApp(makeIdentity({ userId: UUID1 }), repos);
    const res = await app.request("/trpc/shelf.delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: UUID2 }),
    });
    expect(res.status).toBe(403);
  });
});

describe("shelf.list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns shelves for the requested owner", async () => {
    const shelf1 = makeShelf({ id: UUID1, ownerId: UUID2 });
    const shelf2 = makeShelf({ id: UUID3, ownerId: UUID2, name: "Another", slug: "another" });
    const repos = makeRepositories({
      shelves: {
        ...makeRepositories().shelves,
        listShelves: vi.fn().mockResolvedValue([shelf1, shelf2]),
      },
    });
    const app = buildApp(makeIdentity({ userId: UUID1 }), repos);
    const res = await app.request(`/trpc/shelf.list?input=${encodeURIComponent(JSON.stringify({ ownerId: UUID2 }))}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.shelves).toHaveLength(2);
  });

  it("passes the viewer id to listShelves for visibility filtering", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity({ userId: UUID1 }), repos);
    await app.request(`/trpc/shelf.list?input=${encodeURIComponent(JSON.stringify({ ownerId: UUID2 }))}`);
    expect(repos.shelves.listShelves).toHaveBeenCalledWith(UUID2, UUID1);
  });

  it("passes undefined viewer id when unauthenticated", async () => {
    const repos = makeRepositories();
    const app = buildApp(null, repos);
    await app.request(`/trpc/shelf.list?input=${encodeURIComponent(JSON.stringify({ ownerId: UUID2 }))}`);
    expect(repos.shelves.listShelves).toHaveBeenCalledWith(UUID2, undefined);
  });

  it("returns empty array when owner has no shelves", async () => {
    const repos = makeRepositories({
      shelves: {
        ...makeRepositories().shelves,
        listShelves: vi.fn().mockResolvedValue([]),
      },
    });
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request(`/trpc/shelf.list?input=${encodeURIComponent(JSON.stringify({ ownerId: UUID2 }))}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.shelves).toHaveLength(0);
  });

  it("rejects invalid ownerId (non-UUID)", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request(`/trpc/shelf.list?input=${encodeURIComponent(JSON.stringify({ ownerId: "not-a-uuid" }))}`);
    expect(res.status).toBe(400);
  });
});
