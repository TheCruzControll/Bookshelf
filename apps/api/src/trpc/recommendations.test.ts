import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { trpcServer } from "@hono/trpc-server";
import type { Cache } from "@hone/cache";
import type {
  AppRepositories,
  AuthIdentity,
  Recommendation,
  RecommendationInput,
} from "@hone/domain";
import { createTrpcContext } from "./context";
import { router } from "./trpc";
import { recommendationsRouter } from "./recommendations";

vi.mock("@hone/observability", () => ({
  captureException: vi.fn(),
  createLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn() })),
  initSentry: vi.fn(),
  setSentryUser: vi.fn(),
  clearSentryUser: vi.fn(),
}));

const VIEWER = "00000000-0000-0000-0000-000000000001";
const BOOK_A = "00000000-0000-0000-0000-0000000000aa";
const BOOK_B = "00000000-0000-0000-0000-0000000000bb";
const BOOK_C = "00000000-0000-0000-0000-0000000000cc";
const NOW = new Date("2026-05-01T12:00:00Z");

function makeRec(bookId: string, reason: string, score = 7.5): Recommendation {
  return {
    book: {
      id: bookId,
      canonicalTitle: `Book ${bookId.slice(-2)}`,
      createdAt: NOW,
      updatedAt: NOW,
    },
    score,
    reason,
  };
}

function makeRepositories(overrides?: Partial<AppRepositories>): AppRepositories {
  return {
    accountDeletions: { create: vi.fn(), findByProfileId: vi.fn().mockResolvedValue(null), delete: vi.fn(), listExpired: vi.fn().mockResolvedValue([]), purgeProfile: vi.fn() },
    deletedProfileTombstones: { create: vi.fn(), findByHandle: vi.fn().mockResolvedValue(null), purgeExpired: vi.fn().mockResolvedValue(0) },
    profiles: { findById: vi.fn(), findByHandle: vi.fn(), create: vi.fn(), isHandleTaken: vi.fn(), setHandle: vi.fn() },
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
    activity: {
      append: vi.fn(),
      getFriendFeed: vi.fn().mockResolvedValue([]),
      getFriendFeedGrouped: vi.fn().mockResolvedValue([]),
      deleteByReviewId: vi.fn(),
      listByActor: vi.fn().mockResolvedValue([]),
    },
    recommendations: { getForUser: vi.fn().mockResolvedValue([]) },
    follows: { follow: vi.fn(), unfollow: vi.fn(), findFollow: vi.fn(), listFollowers: vi.fn(), listFollowing: vi.fn(), isMutual: vi.fn().mockResolvedValue(false), countMutuals: vi.fn(), listMutualIds: vi.fn().mockResolvedValue([]),
      listFriendsOfFriends: vi.fn().mockResolvedValue([]) },
    blocks: { block: vi.fn(), unblock: vi.fn(), findBlock: vi.fn(), listBlockedByUser: vi.fn().mockResolvedValue([]), listBlockingUser: vi.fn().mockResolvedValue([]), isBlocked: vi.fn() },
    rankings: { upsert: vi.fn(), findById: vi.fn(), findByOwnerAndBook: vi.fn(), listByOwner: vi.fn(), delete: vi.fn(), startBucket: vi.fn() },
    notifications: { registerToken: vi.fn(), removeToken: vi.fn(), listTokensForProfile: vi.fn(), getSetting: vi.fn(), setSetting: vi.fn(), listSettings: vi.fn() },
    imports: { create: vi.fn(), findById: vi.fn(), findByOwnerAndHash: vi.fn(), listByOwner: vi.fn(), updateStatus: vi.fn() },
    contacts: { upsertHashes: vi.fn(), findMatches: vi.fn(), findMatchingProfilesByPhone: vi.fn(), deleteForUser: vi.fn(), deleteExpired: vi.fn(), listByUser: vi.fn(), expireBySaltVersion: vi.fn(), deleteByTargetHash: vi.fn(), softDisable: vi.fn(), purgeOlderThan: vi.fn().mockResolvedValue(0) },
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
      listAllByRecipient: vi.fn().mockResolvedValue([]),
    },
    phoneVerifications: { upsert: vi.fn(), findByPhone: vi.fn(), incrementAttempts: vi.fn(), deleteByPhone: vi.fn(), deleteExpired: vi.fn() },
    phoneNumbers: { upsert: vi.fn(), findByProfileId: vi.fn(), findByHash: vi.fn() },
    salts: { create: vi.fn(), findActive: vi.fn(), findByVersion: vi.fn(), retire: vi.fn(), getLatestVersion: vi.fn(), listAll: vi.fn() },
    ...overrides,
  };
}

function makeIdentity(overrides?: Partial<AuthIdentity>): AuthIdentity {
  return { userId: VIEWER, ...overrides };
}

interface FakeCache extends Cache {
  store: Map<string, unknown>;
}

function makeFakeCache(): FakeCache {
  const store = new Map<string, unknown>();
  const cache: FakeCache = {
    store,
    get: vi.fn(async <T,>(key: string) => (store.has(key) ? (store.get(key) as T) : null)),
    set: vi.fn(async <T,>(key: string, value: T) => {
      store.set(key, value);
    }),
    del: vi.fn(async (key: string) => {
      store.delete(key);
    }),
  } as unknown as FakeCache;
  return cache;
}

function buildApp(
  identity: AuthIdentity | null,
  repositories: AppRepositories,
  cache?: Cache,
) {
  const testRouter = router({ recommendations: recommendationsRouter });
  const app = new Hono();
  const auth = { getCurrentIdentity: async () => identity };
  const deps: { repositories: AppRepositories; auth: typeof auth; cache?: Cache } = {
    repositories,
    auth,
  };
  if (cache) {
    deps.cache = cache;
  }
  app.use(
    "/trpc/*",
    trpcServer({
      router: testRouter,
      createContext: createTrpcContext(deps),
    }),
  );
  return app;
}

describe("recommendations.forDiscover", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    const repos = makeRepositories();
    const app = buildApp(null, repos);
    const res = await app.request(
      `/trpc/recommendations.forDiscover?input=${encodeURIComponent(JSON.stringify({ limit: 10 }))}`,
    );
    expect(res.status).toBe(401);
  });

  it("returns recommendations with reason labels for the authenticated viewer", async () => {
    const recs: Recommendation[] = [
      makeRec(BOOK_A, "Popular among your friends", 8.1),
      makeRec(BOOK_B, "Matches your reading taste", 7.4),
    ];
    const repos = makeRepositories({
      recommendations: { getForUser: vi.fn().mockResolvedValue(recs) },
    });
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request(
      `/trpc/recommendations.forDiscover?input=${encodeURIComponent(JSON.stringify({ limit: 10 }))}`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const list: RecommendationInput[] = body.result.data.recommendations;
    expect(list).toHaveLength(2);
    expect(list[0]?.book.id).toBe(BOOK_A);
    expect(list[0]?.reason).toBe("Popular among your friends");
    expect(list[1]?.reason).toBe("Matches your reading taste");
    expect(repos.recommendations.getForUser).toHaveBeenCalledWith(VIEWER, 10);
  });

  it("serves cached recs on a second call without hitting the repository", async () => {
    const recs: Recommendation[] = [makeRec(BOOK_A, "Widely read on Hone")];
    const getForUser = vi.fn().mockResolvedValue(recs);
    const repos = makeRepositories({ recommendations: { getForUser } });
    const cache = makeFakeCache();
    const app = buildApp(makeIdentity(), repos, cache);

    const first = await app.request(
      `/trpc/recommendations.forDiscover?input=${encodeURIComponent(JSON.stringify({ limit: 10 }))}`,
    );
    expect(first.status).toBe(200);
    const second = await app.request(
      `/trpc/recommendations.forDiscover?input=${encodeURIComponent(JSON.stringify({ limit: 10 }))}`,
    );
    expect(second.status).toBe(200);
    expect(getForUser).toHaveBeenCalledTimes(1);
  });

  it("uses the default limit (20) when no limit is supplied", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request(
      `/trpc/recommendations.forDiscover?input=${encodeURIComponent(JSON.stringify({}))}`,
    );
    expect(res.status).toBe(200);
    expect(repos.recommendations.getForUser).toHaveBeenCalledWith(VIEWER, 20);
  });
});

describe("recommendations.forBookDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    const repos = makeRepositories();
    const app = buildApp(null, repos);
    const res = await app.request(
      `/trpc/recommendations.forBookDetail?input=${encodeURIComponent(JSON.stringify({ bookId: BOOK_A, limit: 8 }))}`,
    );
    expect(res.status).toBe(401);
  });

  it("returns recommendations and excludes the current book", async () => {
    const recs: Recommendation[] = [
      makeRec(BOOK_A, "Popular among your friends"),
      makeRec(BOOK_B, "Matches your reading taste"),
      makeRec(BOOK_C, "Widely read on Hone"),
    ];
    const repos = makeRepositories({
      recommendations: { getForUser: vi.fn().mockResolvedValue(recs) },
    });
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request(
      `/trpc/recommendations.forBookDetail?input=${encodeURIComponent(JSON.stringify({ bookId: BOOK_A, limit: 8 }))}`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const list: RecommendationInput[] = body.result.data.recommendations;
    const ids = list.map((r) => r.book.id);
    expect(ids).not.toContain(BOOK_A);
    expect(ids).toContain(BOOK_B);
    expect(ids).toContain(BOOK_C);
  });

  it("uses the default carousel limit (8) when no limit is supplied", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request(
      `/trpc/recommendations.forBookDetail?input=${encodeURIComponent(JSON.stringify({ bookId: BOOK_A }))}`,
    );
    expect(res.status).toBe(200);
    expect(repos.recommendations.getForUser).toHaveBeenCalledWith(VIEWER, 8);
  });

  it("preserves cold-start reason labels from the service", async () => {
    const recs: Recommendation[] = [
      makeRec(BOOK_B, "Popular on Hone"),
      makeRec(BOOK_C, "An editor's pick"),
    ];
    const repos = makeRepositories({
      recommendations: { getForUser: vi.fn().mockResolvedValue(recs) },
    });
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request(
      `/trpc/recommendations.forBookDetail?input=${encodeURIComponent(JSON.stringify({ bookId: BOOK_A, limit: 8 }))}`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const reasons = body.result.data.recommendations.map(
      (r: RecommendationInput) => r.reason,
    );
    expect(reasons).toEqual(["Popular on Hone", "An editor's pick"]);
  });
});
