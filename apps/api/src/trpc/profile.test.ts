import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { trpcServer } from "@hono/trpc-server";
import { createTrpcContext } from "./context";
import { router } from "./trpc";
import { profileRouter } from "./profile";
import type { AppRepositories, AuthIdentity } from "@hone/domain";
import { POSTURE_C_DEFAULTS } from "@hone/domain";

vi.mock("@hone/observability", () => ({
  captureException: vi.fn(),
  createLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn() })),
  initSentry: vi.fn(),
  setSentryUser: vi.fn(),
  clearSentryUser: vi.fn(),
}));

function makeRepositories(overrides?: Partial<AppRepositories>): AppRepositories {
  const now = new Date();
  const baseProfile = {
    id: "00000000-0000-0000-0000-000000000001",
    handle: "bookworm42",
    displayName: "Book Worm",
    verified: false,
    defaultVisibility: POSTURE_C_DEFAULTS,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  return {
    accountDeletions: { create: vi.fn(), findByProfileId: vi.fn().mockResolvedValue(null), delete: vi.fn(), listExpired: vi.fn().mockResolvedValue([]), purgeProfile: vi.fn() },
    deletedProfileTombstones: {
      create: vi.fn(),
      findByHandle: vi.fn().mockResolvedValue(null),
      purgeExpired: vi.fn().mockResolvedValue(0),
    },
    profiles: {
      findById: vi.fn(),
      findByHandle: vi.fn(),
      create: vi.fn(),
      isHandleTaken: vi.fn().mockResolvedValue(false),
      setHandle: vi.fn().mockResolvedValue(baseProfile),
      ...overrides?.profiles,
    },
    books: { findBookById: vi.fn(), findEditionByIsbn: vi.fn(), findBookByIsbn13: vi.fn().mockResolvedValue(null), search: vi.fn(), upsertFromCatalogResult: vi.fn(), createManual: vi.fn() },
    shelves: { listShelves: vi.fn(), findById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), addBook: vi.fn(), rankShelfItem: vi.fn(), createSystemShelves: vi.fn().mockResolvedValue([]), findShelfItem: vi.fn(), upsertShelfItem: vi.fn(), deleteShelfItem: vi.fn(), getMaxPosition: vi.fn().mockResolvedValue(0), moveShelfItem: vi.fn(), listOwnersWithBookOnSystemShelf: vi.fn().mockResolvedValue([]), listShelfItemsByOwner: vi.fn().mockResolvedValue([]) },
    reviews: { findById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), listByAuthor: vi.fn().mockResolvedValue([]) },
    activity: { append: vi.fn(), getFriendFeed: vi.fn(), getFriendFeedGrouped: vi.fn(), deleteByReviewId: vi.fn(), listByActor: vi.fn().mockResolvedValue([]) },
    recommendations: { getForUser: vi.fn() },
    follows: { follow: vi.fn(), unfollow: vi.fn(), findFollow: vi.fn(), listFollowers: vi.fn(), listFollowing: vi.fn(), isMutual: vi.fn(), countMutuals: vi.fn(), listMutualIds: vi.fn().mockResolvedValue([]),
      listFriendsOfFriends: vi.fn().mockResolvedValue([]) },
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
    userId: "00000000-0000-0000-0000-000000000001",
    ...overrides,
  };
}

function buildApp(identity: AuthIdentity | null, repositories: AppRepositories) {
  const testRouter = router({ profile: profileRouter });
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

describe("profile.checkHandle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns available=true for a free handle", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request(
      "/trpc/profile.checkHandle?input=" + encodeURIComponent(JSON.stringify({ handle: "bookworm42" }))
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.available).toBe(true);
    expect(body.result.data.suggestions).toHaveLength(0);
  });

  it("returns available=false and suggestions for a taken handle", async () => {
    const repos = makeRepositories({
      profiles: {
        findById: vi.fn(),
        findByHandle: vi.fn(),
        create: vi.fn(),
        isHandleTaken: vi.fn().mockResolvedValue(true),
        setHandle: vi.fn(),
      },
    });
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request(
      "/trpc/profile.checkHandle?input=" + encodeURIComponent(JSON.stringify({ handle: "bookworm42" }))
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.available).toBe(false);
    expect(body.result.data.suggestions.length).toBeGreaterThan(0);
  });

  it("returns available=false for reserved handle 'admin'", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request(
      "/trpc/profile.checkHandle?input=" + encodeURIComponent(JSON.stringify({ handle: "admin" }))
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.available).toBe(false);
  });

  it("returns 401 when unauthenticated", async () => {
    const repos = makeRepositories();
    const app = buildApp(null, repos);
    const res = await app.request(
      "/trpc/profile.checkHandle?input=" + encodeURIComponent(JSON.stringify({ handle: "bookworm42" }))
    );
    expect(res.status).toBe(401);
  });

  it("validates handle format - rejects handle shorter than 3 chars", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request(
      "/trpc/profile.checkHandle?input=" + encodeURIComponent(JSON.stringify({ handle: "ab" }))
    );
    expect(res.status).toBe(400);
  });

  it("validates handle format - rejects handle with invalid chars", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request(
      "/trpc/profile.checkHandle?input=" + encodeURIComponent(JSON.stringify({ handle: "book-worm!" }))
    );
    expect(res.status).toBe(400);
  });
});

describe("profile.setHandle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets handle and returns profile on success", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request("/trpc/profile.setHandle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle: "bookworm42" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.profile).toBeDefined();
    expect(body.result.data.profile.handle).toBe("bookworm42");
  });

  it("returns 409 when handle is taken", async () => {
    const repos = makeRepositories({
      profiles: {
        findById: vi.fn(),
        findByHandle: vi.fn(),
        create: vi.fn(),
        isHandleTaken: vi.fn().mockResolvedValue(true),
        setHandle: vi.fn(),
      },
    });
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request("/trpc/profile.setHandle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle: "bookworm42" }),
    });
    expect(res.status).toBe(409);
  });

  it("returns 401 when unauthenticated", async () => {
    const repos = makeRepositories();
    const app = buildApp(null, repos);
    const res = await app.request("/trpc/profile.setHandle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle: "bookworm42" }),
    });
    expect(res.status).toBe(401);
  });

  it("normalizes handle to lowercase before setting", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);
    await app.request("/trpc/profile.setHandle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle: "BookWorm42" }),
    });
    expect(repos.profiles.setHandle).toHaveBeenCalledWith({
      userId: "00000000-0000-0000-0000-000000000001",
      handle: "bookworm42",
    });
  });

  it("rejects reserved handle 'root'", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request("/trpc/profile.setHandle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle: "root" }),
    });
    expect(res.status).toBe(409);
  });
});

describe("profile.createProfile", () => {
  const now = new Date();
  const baseProfile = {
    id: "00000000-0000-0000-0000-000000000001",
    handle: "bookworm42",
    displayName: "Book Worm",
    verified: false,
    defaultVisibility: POSTURE_C_DEFAULTS,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  const systemShelves = [
    { id: "00000000-0000-0000-0000-000000000020", ownerId: baseProfile.id, name: "Reading", slug: "reading", visibility: "followers" as const, isSystem: true, kind: "system" as const, authorType: "user" as const, createdAt: now, updatedAt: now },
    { id: "00000000-0000-0000-0000-000000000021", ownerId: baseProfile.id, name: "Want to Read", slug: "want-to-read", visibility: "followers" as const, isSystem: true, kind: "system" as const, authorType: "user" as const, createdAt: now, updatedAt: now },
    { id: "00000000-0000-0000-0000-000000000022", ownerId: baseProfile.id, name: "Finished", slug: "finished", visibility: "public" as const, isSystem: true, kind: "system" as const, authorType: "user" as const, createdAt: now, updatedAt: now },
    { id: "00000000-0000-0000-0000-000000000023", ownerId: baseProfile.id, name: "Dropped", slug: "dropped", visibility: "followers" as const, isSystem: true, kind: "system" as const, authorType: "user" as const, createdAt: now, updatedAt: now },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates profile and returns four system shelves on success", async () => {
    const repos = makeRepositories({
      profiles: {
        findById: vi.fn(),
        findByHandle: vi.fn(),
        create: vi.fn().mockResolvedValue(baseProfile),
        isHandleTaken: vi.fn().mockResolvedValue(false),
        setHandle: vi.fn(),
      },
      shelves: {
        listShelves: vi.fn(),
        findById: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        addBook: vi.fn(),
        rankShelfItem: vi.fn(),
        createSystemShelves: vi.fn().mockResolvedValue(systemShelves),
        findShelfItem: vi.fn(),
        upsertShelfItem: vi.fn(),
        deleteShelfItem: vi.fn(),
        getMaxPosition: vi.fn().mockResolvedValue(0),
        moveShelfItem: vi.fn(),
        listOwnersWithBookOnSystemShelf: vi.fn().mockResolvedValue([]),
      listShelfItemsByOwner: vi.fn().mockResolvedValue([]),
      },
    });
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request("/trpc/profile.createProfile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle: "bookworm42", displayName: "Book Worm" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.profile).toBeDefined();
    expect(body.result.data.profile.handle).toBe("bookworm42");
    expect(body.result.data.shelves).toHaveLength(4);
  });

  it("returns 401 when unauthenticated", async () => {
    const repos = makeRepositories();
    const app = buildApp(null, repos);
    const res = await app.request("/trpc/profile.createProfile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle: "bookworm42", displayName: "Book Worm" }),
    });
    expect(res.status).toBe(401);
  });

  it("calls createSystemShelves with the new profile id", async () => {
    const repos = makeRepositories({
      profiles: {
        findById: vi.fn(),
        findByHandle: vi.fn(),
        create: vi.fn().mockResolvedValue(baseProfile),
        isHandleTaken: vi.fn().mockResolvedValue(false),
        setHandle: vi.fn(),
      },
      shelves: {
        listShelves: vi.fn(),
        findById: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        addBook: vi.fn(),
        rankShelfItem: vi.fn(),
        createSystemShelves: vi.fn().mockResolvedValue(systemShelves),
        findShelfItem: vi.fn(),
        upsertShelfItem: vi.fn(),
        deleteShelfItem: vi.fn(),
        getMaxPosition: vi.fn().mockResolvedValue(0),
        moveShelfItem: vi.fn(),
        listOwnersWithBookOnSystemShelf: vi.fn().mockResolvedValue([]),
      listShelfItemsByOwner: vi.fn().mockResolvedValue([]),
      },
    });
    const app = buildApp(makeIdentity(), repos);
    await app.request("/trpc/profile.createProfile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle: "bookworm42", displayName: "Book Worm" }),
    });
    expect(repos.shelves.createSystemShelves).toHaveBeenCalledWith(baseProfile.id);
  });
});

// ---------------------------------------------------------------------------
// profile.byHandle — public-profile lookup (S-06, #161)
// ---------------------------------------------------------------------------

describe("profile.byHandle", () => {
  const now = new Date("2026-05-01T00:00:00Z");
  const baseProfile = {
    id: "00000000-0000-0000-0000-000000000099",
    handle: "alive",
    displayName: "Alive User",
    verified: false,
    defaultVisibility: POSTURE_C_DEFAULTS,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the profile when the handle resolves to a live row", async () => {
    const repos = makeRepositories({
      profiles: {
        findById: vi.fn(),
        findByHandle: vi.fn().mockResolvedValue(baseProfile),
        create: vi.fn(),
        isHandleTaken: vi.fn(),
        setHandle: vi.fn(),
      },
    });
    const app = buildApp(null, repos);
    const res = await app.request(
      "/trpc/profile.byHandle?input=" +
        encodeURIComponent(JSON.stringify({ handle: "alive" })),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.profile.handle).toBe("alive");
    expect(repos.deletedProfileTombstones.findByHandle).not.toHaveBeenCalled();
  });

  it("returns 410 with empty body when an active tombstone exists", async () => {
    const repos = makeRepositories({
      profiles: {
        findById: vi.fn(),
        findByHandle: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
        isHandleTaken: vi.fn(),
        setHandle: vi.fn(),
      },
      deletedProfileTombstones: {
        create: vi.fn(),
        findByHandle: vi.fn().mockResolvedValue({
          profileId: "00000000-0000-0000-0000-0000000000aa",
          handle: "deceased",
          deletedAt: now,
          expiresAt: new Date(now.getTime() + 1_000_000),
        }),
        purgeExpired: vi.fn().mockResolvedValue(0),
      },
    });

    // The goneRewriteMiddleware lives in app.ts — build the full app
    // so we exercise the 404→410 rewrite end-to-end.
    const { createApi } = await import("../app");
    const auth = { getCurrentIdentity: async () => null };
    const app = createApi({ repositories: repos, auth });
    const res = await app.request(
      "/trpc/profile.byHandle?input=" +
        encodeURIComponent(JSON.stringify({ handle: "deceased" })),
    );
    expect(res.status).toBe(410);
    const body = await res.text();
    expect(body).toBe("");
  });

  it("returns 404 when no profile and no tombstone exist", async () => {
    const repos = makeRepositories({
      profiles: {
        findById: vi.fn(),
        findByHandle: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
        isHandleTaken: vi.fn(),
        setHandle: vi.fn(),
      },
    });
    const app = buildApp(null, repos);
    const res = await app.request(
      "/trpc/profile.byHandle?input=" +
        encodeURIComponent(JSON.stringify({ handle: "nobody" })),
    );
    expect(res.status).toBe(404);
    expect(repos.deletedProfileTombstones.findByHandle).toHaveBeenCalled();
  });

  it("returns 404 when the tombstone has already expired", async () => {
    const repos = makeRepositories({
      profiles: {
        findById: vi.fn(),
        findByHandle: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
        isHandleTaken: vi.fn(),
        setHandle: vi.fn(),
      },
      deletedProfileTombstones: {
        create: vi.fn(),
        // The repo contract already filters expired rows — simulate
        // that here by returning null.
        findByHandle: vi.fn().mockResolvedValue(null),
        purgeExpired: vi.fn().mockResolvedValue(0),
      },
    });
    const app = buildApp(null, repos);
    const res = await app.request(
      "/trpc/profile.byHandle?input=" +
        encodeURIComponent(JSON.stringify({ handle: "longgone" })),
    );
    expect(res.status).toBe(404);
  });

  it("normalizes the handle to lowercase before lookup", async () => {
    const repos = makeRepositories({
      profiles: {
        findById: vi.fn(),
        findByHandle: vi.fn().mockResolvedValue(baseProfile),
        create: vi.fn(),
        isHandleTaken: vi.fn(),
        setHandle: vi.fn(),
      },
    });
    const app = buildApp(null, repos);
    await app.request(
      "/trpc/profile.byHandle?input=" +
        encodeURIComponent(JSON.stringify({ handle: "Alive" })),
    );
    expect(repos.profiles.findByHandle).toHaveBeenCalledWith("alive");
  });
});
