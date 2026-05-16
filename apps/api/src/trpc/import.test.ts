import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { trpcServer } from "@hono/trpc-server";
import { createTrpcContext } from "./context";
import { router } from "./trpc";
import { importRouter } from "./import";
import type { AppRepositories, AuthIdentity, Import } from "@hone/domain";

vi.mock("@hone/observability", () => ({
  captureException: vi.fn(),
  createLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn() })),
  initSentry: vi.fn(),
  setSentryUser: vi.fn(),
  clearSentryUser: vi.fn(),
}));

const UUID1 = "00000000-0000-0000-0000-000000000001";
const UUID2 = "00000000-0000-0000-0000-000000000002";
const NOW = new Date();
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

function makeImport(overrides?: Partial<Import>): Import {
  return {
    id: UUID2,
    ownerId: UUID1,
    source: "goodreads",
    idempotencyHash: HASH_A,
    conflictCount: 0,
    status: "completed",
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
    books: { findBookById: vi.fn(), findEditionByIsbn: vi.fn(), findBookByIsbn13: vi.fn().mockResolvedValue(null), search: vi.fn(), upsertFromCatalogResult: vi.fn() },
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
    imports: {
      create: vi.fn().mockResolvedValue(makeImport()),
      findById: vi.fn(),
      findByOwnerAndHash: vi.fn().mockResolvedValue(null),
      listByOwner: vi.fn(),
      updateStatus: vi.fn().mockResolvedValue(makeImport({ status: "processing" })),
      ...overrides?.imports,
    },
    contacts: { upsertHashes: vi.fn(), findMatches: vi.fn(), findMatchingProfilesByPhone: vi.fn(), deleteForUser: vi.fn(), deleteExpired: vi.fn(), expireBySaltVersion: vi.fn(), deleteByTargetHash: vi.fn(), listByUser: vi.fn() },
    emailIndex: { upsertHashes: vi.fn(), findMatches: vi.fn(), deleteForUser: vi.fn(), deleteExpired: vi.fn(), expireBySaltVersion: vi.fn(), deleteByTargetHash: vi.fn(), listByUser: vi.fn() },
    lists: { create: vi.fn(), findById: vi.fn(), listByOwner: vi.fn(), update: vi.fn(), delete: vi.fn(), addItem: vi.fn(), removeItem: vi.fn(), listItems: vi.fn(), reorderItems: vi.fn() },
    authIdentities: { create: vi.fn(), findByProvider: vi.fn(), listByProfile: vi.fn() },
    sessions: { create: vi.fn(), findByTokenHash: vi.fn(), revokeByTokenHash: vi.fn(), revokeAllForProfile: vi.fn() },
    handleHistory: { record: vi.fn(), findCurrentByOldHandle: vi.fn() },
    magicLinks: { create: vi.fn(), findByTokenHash: vi.fn(), markConsumed: vi.fn(), deleteExpiredForEmail: vi.fn() },
    inAppNotifications: { list: vi.fn().mockResolvedValue([]), markRead: vi.fn().mockResolvedValue(undefined), findById: vi.fn(), countSince: vi.fn().mockResolvedValue(0), countSinceByActor: vi.fn().mockResolvedValue(0), create: vi.fn() },
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
  const testRouter = router({ import: importRouter });
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

describe("import.checkDuplicate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns isDuplicate: false when no matching hash exists", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request(
      `/trpc/import.checkDuplicate?input=${encodeURIComponent(JSON.stringify({ fileHash: HASH_A }))}`
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.isDuplicate).toBe(false);
    expect(body.result.data.existingImportId).toBeUndefined();
    expect(body.result.data.options).toBeUndefined();
  });

  it("returns isDuplicate: true with three options on hash match", async () => {
    const repos = makeRepositories({
      imports: {
        create: vi.fn(),
        findById: vi.fn(),
        findByOwnerAndHash: vi.fn().mockResolvedValue(makeImport()),
        listByOwner: vi.fn(),
        updateStatus: vi.fn(),
      },
    });
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request(
      `/trpc/import.checkDuplicate?input=${encodeURIComponent(JSON.stringify({ fileHash: HASH_A }))}`
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.isDuplicate).toBe(true);
    expect(body.result.data.existingImportId).toBe(UUID2);
    expect(body.result.data.options).toEqual([
      "process_from_scratch",
      "merge_changes_only",
      "cancel",
    ]);
  });

  it("returns 401 when unauthenticated", async () => {
    const repos = makeRepositories();
    const app = buildApp(null, repos);
    const res = await app.request(
      `/trpc/import.checkDuplicate?input=${encodeURIComponent(JSON.stringify({ fileHash: HASH_A }))}`
    );
    expect(res.status).toBe(401);
  });

  it("rejects invalid hash (too short)", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request(
      `/trpc/import.checkDuplicate?input=${encodeURIComponent(JSON.stringify({ fileHash: "abc123" }))}`
    );
    expect(res.status).toBe(400);
  });

  it("rejects invalid hash (non-hex characters)", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request(
      `/trpc/import.checkDuplicate?input=${encodeURIComponent(JSON.stringify({ fileHash: "g".repeat(64) }))}`
    );
    expect(res.status).toBe(400);
  });

  it("calls findByOwnerAndHash with the authenticated user's ID", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity({ userId: UUID1 }), repos);
    await app.request(
      `/trpc/import.checkDuplicate?input=${encodeURIComponent(JSON.stringify({ fileHash: HASH_B }))}`
    );
    expect(repos.imports.findByOwnerAndHash).toHaveBeenCalledWith({
      ownerId: UUID1,
      hash: HASH_B,
    });
  });
});

describe("import.confirmReupload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a new import when strategy is process_from_scratch", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request("/trpc/import.confirmReupload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileHash: HASH_A, strategy: "process_from_scratch" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.status).toBe("created");
    expect(body.result.data.importId).toBeDefined();
    expect(repos.imports.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: UUID1,
        source: "goodreads",
        idempotencyHash: HASH_A,
      })
    );
  });

  it("creates a new import and transitions to processing when strategy is merge_changes_only", async () => {
    const createdImport = makeImport({ status: "pending" });
    const repos = makeRepositories({
      imports: {
        create: vi.fn().mockResolvedValue(createdImport),
        findById: vi.fn(),
        findByOwnerAndHash: vi.fn(),
        listByOwner: vi.fn(),
        updateStatus: vi.fn().mockResolvedValue(makeImport({ status: "processing" })),
      },
    });
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request("/trpc/import.confirmReupload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileHash: HASH_A, strategy: "merge_changes_only" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.status).toBe("created");
    expect(repos.imports.updateStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        id: createdImport.id,
        status: "processing",
      })
    );
  });

  it("returns cancelled status when strategy is cancel", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request("/trpc/import.confirmReupload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileHash: HASH_A, strategy: "cancel" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.status).toBe("cancelled");
    expect(body.result.data.importId).toBeUndefined();
    expect(repos.imports.create).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    const repos = makeRepositories();
    const app = buildApp(null, repos);
    const res = await app.request("/trpc/import.confirmReupload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileHash: HASH_A, strategy: "process_from_scratch" }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects invalid strategy value", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request("/trpc/import.confirmReupload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileHash: HASH_A, strategy: "invalid_strategy" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects invalid fileHash", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request("/trpc/import.confirmReupload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileHash: "short", strategy: "cancel" }),
    });
    expect(res.status).toBe(400);
  });
});
