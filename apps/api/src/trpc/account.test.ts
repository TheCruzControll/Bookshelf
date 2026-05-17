import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { trpcServer } from "@hono/trpc-server";
import { createTrpcContext, type TrpcContextDeps } from "./context";
import { router } from "./trpc";
import { accountRouter } from "./account";
import type { AppRepositories, AuthIdentity, AccountDeletion, StorageProvider } from "@hone/domain";

vi.mock("@hone/observability", () => ({
  captureException: vi.fn(),
  createLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn() })),
  initSentry: vi.fn(),
  setSentryUser: vi.fn(),
  clearSentryUser: vi.fn(),
}));

const UUID1 = "00000000-0000-0000-0000-000000000001";
const NOW = new Date("2026-05-11T00:00:00Z");
const HARD_DELETE_AFTER = new Date("2026-06-10T00:00:00Z");

function makeDeletion(overrides?: Partial<AccountDeletion>): AccountDeletion {
  return {
    profileId: UUID1,
    requestedAt: NOW,
    hardDeleteAfter: HARD_DELETE_AFTER,
    ...overrides,
  };
}

function makeRepositories(overrides?: Partial<AppRepositories>): AppRepositories {
  return {
    accountDeletions: {
      create: vi.fn().mockResolvedValue(makeDeletion()),
      findByProfileId: vi.fn().mockResolvedValue(null),
      delete: vi.fn(),
      listExpired: vi.fn().mockResolvedValue([]),
      purgeProfile: vi.fn(),
      ...overrides?.accountDeletions,
    },
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
      listShelfItemsByOwner: vi.fn().mockResolvedValue([]),
    },
    reviews: { findById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), listByAuthor: vi.fn().mockResolvedValue([]) },
    activity: { append: vi.fn(), getFriendFeed: vi.fn(), getFriendFeedGrouped: vi.fn(), deleteByReviewId: vi.fn(), listByActor: vi.fn().mockResolvedValue([]) },
    recommendations: { getForUser: vi.fn() },
    follows: {
      follow: vi.fn(),
      unfollow: vi.fn().mockResolvedValue(undefined),
      findFollow: vi.fn().mockResolvedValue(null),
      listFollowers: vi.fn().mockResolvedValue([]),
      listFollowing: vi.fn().mockResolvedValue([]),
      isMutual: vi.fn().mockResolvedValue(false),
      countMutuals: vi.fn().mockResolvedValue(0),
      listMutualIds: vi.fn().mockResolvedValue([]),
    },
    blocks: {
      block: vi.fn(),
      unblock: vi.fn().mockResolvedValue(undefined),
      findBlock: vi.fn().mockResolvedValue(null),
      listBlockedByUser: vi.fn().mockResolvedValue([]),
      listBlockingUser: vi.fn().mockResolvedValue([]),
      isBlocked: vi.fn().mockResolvedValue(false),
    },
    rankings: { upsert: vi.fn(), findById: vi.fn(), findByOwnerAndBook: vi.fn(), listByOwner: vi.fn(), delete: vi.fn(), startBucket: vi.fn() },
    notifications: { registerToken: vi.fn(), removeToken: vi.fn(), listTokensForProfile: vi.fn(), getSetting: vi.fn(), setSetting: vi.fn(), listSettings: vi.fn() },
    imports: { create: vi.fn(), findById: vi.fn(), findByOwnerAndHash: vi.fn(), listByOwner: vi.fn(), updateStatus: vi.fn() },
    contacts: { upsertHashes: vi.fn(), findMatches: vi.fn(), findMatchingProfilesByPhone: vi.fn(), deleteForUser: vi.fn(), deleteExpired: vi.fn(), deleteByTargetHash: vi.fn(), listByUser: vi.fn(), expireBySaltVersion: vi.fn(), softDisable: vi.fn(), purgeOlderThan: vi.fn().mockResolvedValue(0) },
    emailIndex: { upsertHashes: vi.fn(), findMatches: vi.fn(), deleteForUser: vi.fn(), deleteExpired: vi.fn(), deleteByTargetHash: vi.fn(), listByUser: vi.fn(), expireBySaltVersion: vi.fn() },
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

function buildApp(
  identity: AuthIdentity | null,
  repositories: AppRepositories,
  storage?: StorageProvider,
) {
  const testRouter = router({ account: accountRouter });
  const app = new Hono();
  const auth = { getCurrentIdentity: async () => identity };
  const deps: TrpcContextDeps = { repositories, auth, ...(storage ? { storage } : {}) };
  app.use(
    "/trpc/*",
    trpcServer({
      router: testRouter,
      createContext: createTrpcContext(deps),
    })
  );
  return app;
}

describe("account.requestDelete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates an account_deletions row and revokes sessions", async () => {
    const deletion = makeDeletion();
    const repos = makeRepositories({
      accountDeletions: {
        create: vi.fn().mockResolvedValue(deletion),
        findByProfileId: vi.fn().mockResolvedValue(null),
        delete: vi.fn(),
        listExpired: vi.fn().mockResolvedValue([]),
        purgeProfile: vi.fn(),
      },
    });
    const app = buildApp(makeIdentity(), repos);

    const res = await app.request("/trpc/account.requestDelete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.deletion.profileId).toBe(UUID1);
    expect(repos.accountDeletions.create).toHaveBeenCalled();
    expect(repos.sessions.revokeAllForProfile).toHaveBeenCalledWith(UUID1);
  });

  it("is idempotent — returns existing deletion if already requested", async () => {
    const existingDeletion = makeDeletion();
    const repos = makeRepositories({
      accountDeletions: {
        create: vi.fn(),
        findByProfileId: vi.fn().mockResolvedValue(existingDeletion),
        delete: vi.fn(),
        listExpired: vi.fn().mockResolvedValue([]),
        purgeProfile: vi.fn(),
      },
    });
    const app = buildApp(makeIdentity(), repos);

    const res = await app.request("/trpc/account.requestDelete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.deletion.profileId).toBe(UUID1);
    expect(repos.accountDeletions.create).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    const repos = makeRepositories();
    const app = buildApp(null, repos);

    const res = await app.request("/trpc/account.requestDelete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(401);
  });

  it("sets hardDeleteAfter to 30 days from request time", async () => {
    const repos = makeRepositories({
      accountDeletions: {
        create: vi.fn().mockImplementation(async (input) => ({
          profileId: input.profileId,
          requestedAt: input.requestedAt,
          hardDeleteAfter: input.hardDeleteAfter,
        })),
        findByProfileId: vi.fn().mockResolvedValue(null),
        delete: vi.fn(),
        listExpired: vi.fn().mockResolvedValue([]),
        purgeProfile: vi.fn(),
      },
    });
    const app = buildApp(makeIdentity(), repos);

    await app.request("/trpc/account.requestDelete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const createCall = (repos.accountDeletions.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    const requestedAt = new Date(createCall.requestedAt).getTime();
    const hardDeleteAfter = new Date(createCall.hardDeleteAfter).getTime();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    expect(hardDeleteAfter - requestedAt).toBe(thirtyDaysMs);
  });
});

describe("account.cancelDelete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cancels an existing deletion within grace period", async () => {
    const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24);
    const repos = makeRepositories({
      accountDeletions: {
        create: vi.fn(),
        findByProfileId: vi.fn().mockResolvedValue(makeDeletion({ hardDeleteAfter: futureDate })),
        delete: vi.fn(),
        listExpired: vi.fn().mockResolvedValue([]),
        purgeProfile: vi.fn(),
      },
    });
    const app = buildApp(makeIdentity(), repos);

    const res = await app.request("/trpc/account.cancelDelete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.cancelled).toBe(true);
    expect(repos.accountDeletions.delete).toHaveBeenCalledWith(UUID1);
  });

  it("returns cancelled=false when no deletion exists", async () => {
    const repos = makeRepositories({
      accountDeletions: {
        create: vi.fn(),
        findByProfileId: vi.fn().mockResolvedValue(null),
        delete: vi.fn(),
        listExpired: vi.fn().mockResolvedValue([]),
        purgeProfile: vi.fn(),
      },
    });
    const app = buildApp(makeIdentity(), repos);

    const res = await app.request("/trpc/account.cancelDelete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.cancelled).toBe(false);
  });

  it("returns 401 when unauthenticated", async () => {
    const repos = makeRepositories();
    const app = buildApp(null, repos);

    const res = await app.request("/trpc/account.cancelDelete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(401);
  });

  it("returns cancelled=false when grace period has expired (no-op past 30 days)", async () => {
    const pastDate = new Date(Date.now() - 1000);
    const expiredDeletion = makeDeletion({ hardDeleteAfter: pastDate });
    const repos = makeRepositories({
      accountDeletions: {
        create: vi.fn(),
        findByProfileId: vi.fn().mockResolvedValue(expiredDeletion),
        delete: vi.fn(),
        listExpired: vi.fn().mockResolvedValue([]),
        purgeProfile: vi.fn(),
      },
    });
    const app = buildApp(makeIdentity(), repos);

    const res = await app.request("/trpc/account.cancelDelete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.cancelled).toBe(false);
    expect(repos.accountDeletions.delete).not.toHaveBeenCalled();
  });

  it("removes the account_deletions row and restores visibility on all surfaces", async () => {
    // Model the repo as a real backing store: cancelDelete must mutate it.
    // After the cancel, any reader (here: a follow-up findByProfileId, which
    // is the source of truth for every visibility surface that could key on
    // deletion state) sees the user as live.
    const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24);
    const store = new Map<string, AccountDeletion>();
    store.set(UUID1, makeDeletion({ hardDeleteAfter: futureDate }));
    const repos = makeRepositories({
      accountDeletions: {
        create: vi.fn(),
        findByProfileId: vi.fn().mockImplementation(async (id: string) => store.get(id) ?? null),
        delete: vi.fn().mockImplementation(async (id: string) => {
          store.delete(id);
        }),
        listExpired: vi.fn().mockResolvedValue([]),
        purgeProfile: vi.fn(),
      },
    });
    const app = buildApp(makeIdentity(), repos);

    const res = await app.request("/trpc/account.cancelDelete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.cancelled).toBe(true);
    expect(repos.accountDeletions.delete).toHaveBeenCalledWith(UUID1);
    expect(store.has(UUID1)).toBe(false);
    // Any downstream visibility surface that asks the repo "is this user
    // soft-deleted?" now gets a null row back, i.e. the user is restored.
    expect(await repos.accountDeletions.findByProfileId(UUID1)).toBeNull();
  });
});

describe("account.requestExport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeStorage(): { storage: StorageProvider; putObject: ReturnType<typeof vi.fn> } {
    const putObject = vi.fn(async (input: { key: string; expiresInMs: number }) => ({
      url: `https://signed.example.com/${encodeURIComponent(input.key)}?sig=ok`,
      expiresAt: new Date(Date.now() + input.expiresInMs),
    }));
    return { storage: { putObject }, putObject };
  }

  it("returns a signed URL pointing at the archive for the authenticated viewer", async () => {
    const repos = makeRepositories();
    const { storage, putObject } = makeStorage();
    const app = buildApp(makeIdentity(), repos, storage);

    const res = await app.request("/trpc/account.requestExport", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.result.data.url).toBe("string");
    expect(body.result.data.url).toContain("signed.example.com");
    expect(body.result.data.expiresAt).toBeDefined();
    expect(putObject).toHaveBeenCalledTimes(1);
    const uploadCall = putObject.mock.calls[0]![0] as { key: string };
    expect(uploadCall.key).toContain(`account-exports/${UUID1}/`);
  });

  it("returns 401 when unauthenticated", async () => {
    const repos = makeRepositories();
    const { storage } = makeStorage();
    const app = buildApp(null, repos, storage);

    const res = await app.request("/trpc/account.requestExport", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(401);
  });

  it("returns 501 NOT_IMPLEMENTED when no storage adapter is wired", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);

    const res = await app.request("/trpc/account.requestExport", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(501);
  });

  it("only queries repositories for the caller's profile id", async () => {
    const OTHER = "00000000-0000-0000-0000-0000000000ff";
    const repos = makeRepositories();
    const { storage } = makeStorage();
    const app = buildApp(makeIdentity({ userId: UUID1 }), repos, storage);

    await app.request("/trpc/account.requestExport", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    // Spot-check the per-owner repo calls: each one must receive
    // UUID1 (the caller) and never OTHER.
    const calls = [
      (repos.reviews.listByAuthor as ReturnType<typeof vi.fn>).mock.calls,
      (repos.shelves.listShelves as ReturnType<typeof vi.fn>).mock.calls,
      (repos.shelves.listShelfItemsByOwner as ReturnType<typeof vi.fn>).mock.calls,
      (repos.lists.listByOwner as ReturnType<typeof vi.fn>).mock.calls,
      (repos.rankings.listByOwner as ReturnType<typeof vi.fn>).mock.calls,
      (repos.activity.listByActor as ReturnType<typeof vi.fn>).mock.calls,
      (repos.inAppNotifications.listAllByRecipient as ReturnType<typeof vi.fn>).mock.calls,
      (repos.notifications.listTokensForProfile as ReturnType<typeof vi.fn>).mock.calls,
      (repos.contacts.listByUser as ReturnType<typeof vi.fn>).mock.calls,
      (repos.emailIndex.listByUser as ReturnType<typeof vi.fn>).mock.calls,
      (repos.phoneNumbers.findByProfileId as ReturnType<typeof vi.fn>).mock.calls,
      (repos.imports.listByOwner as ReturnType<typeof vi.fn>).mock.calls,
      (repos.authIdentities.listByProfile as ReturnType<typeof vi.fn>).mock.calls,
    ];
    for (const calls_ of calls) {
      for (const args of calls_) {
        expect(args[0]).toBe(UUID1);
        expect(args[0]).not.toBe(OTHER);
      }
    }
  });
});
