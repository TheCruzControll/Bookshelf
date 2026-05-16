import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { trpcServer } from "@hono/trpc-server";
import { createTrpcContext } from "./context";
import { router } from "./trpc";
import { rankingRouter } from "./ranking";
import type { AppRepositories, AuthIdentity, Ranking } from "@hone/domain";
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
const UUID4 = "00000000-0000-0000-0000-000000000004";
const UUID5 = "00000000-0000-0000-0000-000000000005";
const NOW = new Date();

function makeRanking(overrides?: Partial<Ranking>): Ranking {
  return {
    id: UUID1,
    profileId: UUID1,
    bookId: UUID2,
    position: 0,
    score: 0,
    bucket: 3,
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
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
    shelves: { listShelves: vi.fn(), findById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), addBook: vi.fn(), rankShelfItem: vi.fn(), createSystemShelves: vi.fn(), findShelfItem: vi.fn(), upsertShelfItem: vi.fn(), deleteShelfItem: vi.fn(), getMaxPosition: vi.fn().mockResolvedValue(0), moveShelfItem: vi.fn() },
    reviews: { findById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    activity: { append: vi.fn(), getFriendFeed: vi.fn(), getFriendFeedGrouped: vi.fn(), deleteByReviewId: vi.fn() },
    recommendations: { getForUser: vi.fn() },
    follows: { follow: vi.fn(), unfollow: vi.fn(), findFollow: vi.fn(), listFollowers: vi.fn(), listFollowing: vi.fn(), isMutual: vi.fn(), countMutuals: vi.fn() },
    blocks: { block: vi.fn(), unblock: vi.fn(), findBlock: vi.fn(), listBlockedByUser: vi.fn(), listBlockingUser: vi.fn(), isBlocked: vi.fn() },
    rankings: {
      upsert: vi.fn(),
      findById: vi.fn(),
      findByOwnerAndBook: vi.fn(),
      listByOwner: vi.fn(),
      delete: vi.fn(),
      startBucket: vi.fn().mockResolvedValue(makeRanking()),
      ...overrides?.rankings,
    },
    notifications: { registerToken: vi.fn(), removeToken: vi.fn(), listTokensForProfile: vi.fn(), getSetting: vi.fn(), setSetting: vi.fn(), listSettings: vi.fn() },
    imports: { create: vi.fn(), findById: vi.fn(), findByOwnerAndHash: vi.fn(), listByOwner: vi.fn(), updateStatus: vi.fn() },
    contacts: { upsertHashes: vi.fn(), findMatches: vi.fn(), deleteForUser: vi.fn(), deleteExpired: vi.fn(), expireBySaltVersion: vi.fn(), deleteByTargetHash: vi.fn(), listByUser: vi.fn() },
    emailIndex: { upsertHashes: vi.fn(), findMatches: vi.fn(), deleteForUser: vi.fn(), deleteExpired: vi.fn(), expireBySaltVersion: vi.fn(), deleteByTargetHash: vi.fn(), listByUser: vi.fn() },
    lists: { create: vi.fn(), findById: vi.fn(), listByOwner: vi.fn(), update: vi.fn(), delete: vi.fn(), addItem: vi.fn(), removeItem: vi.fn(), listItems: vi.fn(), reorderItems: vi.fn() },
    authIdentities: { create: vi.fn(), findByProvider: vi.fn(), listByProfile: vi.fn() },
    sessions: { create: vi.fn(), findByTokenHash: vi.fn(), revokeByTokenHash: vi.fn(), revokeAllForProfile: vi.fn() },
    handleHistory: { record: vi.fn(), findCurrentByOldHandle: vi.fn() },
    magicLinks: { create: vi.fn(), findByTokenHash: vi.fn(), markConsumed: vi.fn(), deleteExpiredForEmail: vi.fn() },
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

function makeCache(store: Map<string, unknown> = new Map()): Cache {
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: unknown) => { store.set(key, value); }),
    del: vi.fn(async (key: string) => { store.delete(key); }),
    mget: vi.fn(async (keys: string[]) => keys.map((k) => store.get(k) ?? null)),
    mset: vi.fn(async (entries: { key: string; value: unknown }[]) => { entries.forEach((e) => store.set(e.key, e.value)); }),
    incr: vi.fn(async () => 0),
  } as unknown as Cache;
}

function buildApp(identity: AuthIdentity | null, repositories: AppRepositories, cache?: Cache) {
  const testRouter = router({ ranking: rankingRouter });
  const app = new Hono();
  const auth = { getCurrentIdentity: async () => identity };
  const deps = cache !== undefined ? { repositories, auth, cache } : { repositories, auth };
  app.use(
    "/trpc/*",
    trpcServer({
      router: testRouter,
      createContext: createTrpcContext(deps),
    })
  );
  return app;
}

describe("ranking.startBucket", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records bucket and returns rankingId, bookId, and bucket on success", async () => {
    const ranking = makeRanking({ id: UUID1, bookId: UUID2, bucket: 3 });
    const repos = makeRepositories({
      rankings: {
        upsert: vi.fn(),
        findById: vi.fn(),
        findByOwnerAndBook: vi.fn(),
        listByOwner: vi.fn(),
        delete: vi.fn(),
        startBucket: vi.fn().mockResolvedValue(ranking),
      },
    });
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request("/trpc/ranking.startBucket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId: UUID2, bucket: 3 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.rankingId).toBe(UUID1);
    expect(body.result.data.bookId).toBe(UUID2);
    expect(body.result.data.bucket).toBe(3);
  });

  it("calls startBucket with the authenticated user's id as ownerId", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity({ userId: UUID1 }), repos);
    await app.request("/trpc/ranking.startBucket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId: UUID2, bucket: 5 }),
    });
    expect(repos.rankings.startBucket).toHaveBeenCalledWith({
      ownerId: UUID1,
      bookId: UUID2,
      bucket: 5,
    });
  });

  it("returns 401 when unauthenticated", async () => {
    const repos = makeRepositories();
    const app = buildApp(null, repos);
    const res = await app.request("/trpc/ranking.startBucket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId: UUID2, bucket: 3 }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects bucket below 1", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request("/trpc/ranking.startBucket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId: UUID2, bucket: 0 }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects bucket above 5", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request("/trpc/ranking.startBucket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId: UUID2, bucket: 6 }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects non-integer bucket value", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request("/trpc/ranking.startBucket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId: UUID2, bucket: 2.5 }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects invalid bookId (non-UUID)", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request("/trpc/ranking.startBucket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId: "not-a-uuid", bucket: 3 }),
    });
    expect(res.status).toBe(400);
  });

  it("bucket is never exposed after submission (not returned beyond the output schema)", async () => {
    const ranking = makeRanking({ bucket: 4 });
    const repos = makeRepositories({
      rankings: {
        upsert: vi.fn(),
        findById: vi.fn(),
        findByOwnerAndBook: vi.fn(),
        listByOwner: vi.fn(),
        delete: vi.fn(),
        startBucket: vi.fn().mockResolvedValue(ranking),
      },
    });
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request("/trpc/ranking.startBucket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId: UUID2, bucket: 4 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    const data = body.result.data;
    expect(Object.keys(data)).toEqual(["rankingId", "bookId", "bucket"]);
    expect(data).not.toHaveProperty("score");
    expect(data).not.toHaveProperty("position");
  });
});

describe("ranking.compare", () => {
  const RANKING_ID = UUID1;
  const NEW_BOOK_ID = UUID2;
  const BOOK_A = UUID3;
  const BOOK_B = UUID4;
  const BOOK_C = UUID5;

  function makeRankingSession(): Ranking {
    return makeRanking({ id: RANKING_ID, profileId: UUID1, bookId: NEW_BOOK_ID, bucket: 3 });
  }

  function makeExistingRankings(): Ranking[] {
    return [
      makeRanking({ id: "00000000-0000-0000-0000-000000000010", profileId: UUID1, bookId: BOOK_A, position: 1, bucket: 3 }),
      makeRanking({ id: "00000000-0000-0000-0000-000000000011", profileId: UUID1, bookId: BOOK_B, position: 2, bucket: 3 }),
      makeRanking({ id: "00000000-0000-0000-0000-000000000012", profileId: UUID1, bookId: BOOK_C, position: 3, bucket: 3 }),
    ];
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    const repos = makeRepositories();
    const app = buildApp(null, repos);
    const res = await app.request("/trpc/ranking.compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rankingId: RANKING_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when ranking session not found", async () => {
    const repos = makeRepositories({
      rankings: {
        upsert: vi.fn(),
        findById: vi.fn().mockResolvedValue(null),
        findByOwnerAndBook: vi.fn(),
        listByOwner: vi.fn().mockResolvedValue([]),
        delete: vi.fn(),
        startBucket: vi.fn(),
      },
    });
    const cache = makeCache();
    const app = buildApp(makeIdentity(), repos, cache);
    const res = await app.request("/trpc/ranking.compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rankingId: RANKING_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns done=true immediately when there are no existing ranked books", async () => {
    const repos = makeRepositories({
      rankings: {
        upsert: vi.fn(),
        findById: vi.fn().mockResolvedValue(makeRankingSession()),
        findByOwnerAndBook: vi.fn(),
        listByOwner: vi.fn().mockResolvedValue([makeRankingSession()]),
        delete: vi.fn(),
        startBucket: vi.fn(),
      },
    });
    const cache = makeCache();
    const app = buildApp(makeIdentity(), repos, cache);
    const res = await app.request("/trpc/ranking.compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rankingId: RANKING_ID }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.done).toBe(true);
    expect(body.result.data.position).toBe(0);
  });

  it("returns done=false with next pair when ranked books exist", async () => {
    const session = makeRankingSession();
    const existing = makeExistingRankings();
    const repos = makeRepositories({
      rankings: {
        upsert: vi.fn(),
        findById: vi.fn().mockResolvedValue(session),
        findByOwnerAndBook: vi.fn(),
        listByOwner: vi.fn().mockResolvedValue([session, ...existing]),
        delete: vi.fn(),
        startBucket: vi.fn(),
      },
    });
    const cache = makeCache();
    const app = buildApp(makeIdentity(), repos, cache);
    const res = await app.request("/trpc/ranking.compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rankingId: RANKING_ID }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.done).toBe(false);
    expect(body.result.data.newBookId).toBe(NEW_BOOK_ID);
    expect(typeof body.result.data.candidateBookId).toBe("string");
  });

  it("state is kept between calls: second call uses cached state", async () => {
    const session = makeRankingSession();
    const existing = makeExistingRankings();
    const store = new Map<string, unknown>();
    const repos = makeRepositories({
      rankings: {
        upsert: vi.fn(),
        findById: vi.fn().mockResolvedValue(session),
        findByOwnerAndBook: vi.fn(),
        listByOwner: vi.fn().mockResolvedValue([session, ...existing]),
        delete: vi.fn(),
        startBucket: vi.fn(),
      },
    });
    const cache = makeCache(store);
    const app = buildApp(makeIdentity(), repos, cache);

    await app.request("/trpc/ranking.compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rankingId: RANKING_ID }),
    });

    expect(store.has(`compare:${RANKING_ID}`)).toBe(true);

    const res2 = await app.request("/trpc/ranking.compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rankingId: RANKING_ID, winner: "new" }),
    });
    expect(res2.status).toBe(200);
    expect(repos.rankings.findById).toHaveBeenCalledTimes(1);
  });

  it("converges and returns done=true after binary search exhausts range", async () => {
    const session = makeRankingSession();
    const singleExisting = [
      makeRanking({ id: "00000000-0000-0000-0000-000000000010", profileId: UUID1, bookId: BOOK_A, position: 1, bucket: 3 }),
    ];
    const store = new Map<string, unknown>();
    const repos = makeRepositories({
      rankings: {
        upsert: vi.fn(),
        findById: vi.fn().mockResolvedValue(session),
        findByOwnerAndBook: vi.fn(),
        listByOwner: vi.fn().mockResolvedValue([session, ...singleExisting]),
        delete: vi.fn(),
        startBucket: vi.fn(),
      },
    });
    const cache = makeCache(store);
    const app = buildApp(makeIdentity(), repos, cache);

    const res1 = await app.request("/trpc/ranking.compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rankingId: RANKING_ID }),
    });
    expect((await res1.json()).result.data.done).toBe(false);

    const res2 = await app.request("/trpc/ranking.compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rankingId: RANKING_ID, winner: "existing" }),
    });
    const body2 = await res2.json();
    expect(body2.result.data.done).toBe(true);
    expect(typeof body2.result.data.position).toBe("number");
    expect(store.has(`compare:${RANKING_ID}`)).toBe(false);
  });

  it("rejects invalid rankingId", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request("/trpc/ranking.compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rankingId: "not-a-uuid" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects invalid winner value", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request("/trpc/ranking.compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rankingId: RANKING_ID, winner: "invalid" }),
    });
    expect(res.status).toBe(400);
  });

  it("creates a review and returns reviewId when done=true and reviewBody is provided", async () => {
    const session = makeRankingSession();
    const REVIEW_ID = "00000000-0000-0000-0000-000000000099";
    const store = new Map<string, unknown>();
    const mockReview = {
      id: REVIEW_ID,
      authorId: UUID1,
      bookId: NEW_BOOK_ID,
      body: "Great book!",
      visibility: "public" as const,
      version: 1,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const repos = makeRepositories({
      rankings: {
        upsert: vi.fn(),
        findById: vi.fn().mockResolvedValue(session),
        findByOwnerAndBook: vi.fn(),
        listByOwner: vi.fn().mockResolvedValue([session]),
        delete: vi.fn(),
        startBucket: vi.fn(),
      },
      reviews: {
        findById: vi.fn(),
        create: vi.fn().mockResolvedValue(mockReview),
        update: vi.fn(),
        delete: vi.fn(),
      },
      activity: { append: vi.fn(), getFriendFeed: vi.fn(), getFriendFeedGrouped: vi.fn(), deleteByReviewId: vi.fn() },
    });
    const cache = makeCache(store);
    const app = buildApp(makeIdentity(), repos, cache);

    const res = await app.request("/trpc/ranking.compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rankingId: RANKING_ID, reviewBody: "Great book!", reviewVisibility: "public" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.done).toBe(true);
    expect(body.result.data.reviewId).toBe(REVIEW_ID);
    expect(repos.reviews.create).toHaveBeenCalledWith({
      authorId: UUID1,
      bookId: NEW_BOOK_ID,
      body: "Great book!",
      visibility: "public",
    });
  });

  it("does not create a review when done=true and reviewBody is absent", async () => {
    const session = makeRankingSession();
    const store = new Map<string, unknown>();
    const repos = makeRepositories({
      rankings: {
        upsert: vi.fn(),
        findById: vi.fn().mockResolvedValue(session),
        findByOwnerAndBook: vi.fn(),
        listByOwner: vi.fn().mockResolvedValue([session]),
        delete: vi.fn(),
        startBucket: vi.fn(),
      },
    });
    const cache = makeCache(store);
    const app = buildApp(makeIdentity(), repos, cache);

    const res = await app.request("/trpc/ranking.compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rankingId: RANKING_ID }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.done).toBe(true);
    expect(body.result.data.reviewId).toBeUndefined();
    expect(repos.reviews.create).not.toHaveBeenCalled();
  });

  it("defaults reviewVisibility to public when reviewBody is provided without reviewVisibility", async () => {
    const session = makeRankingSession();
    const REVIEW_ID = "00000000-0000-0000-0000-000000000098";
    const store = new Map<string, unknown>();
    const mockReview = {
      id: REVIEW_ID,
      authorId: UUID1,
      bookId: NEW_BOOK_ID,
      body: "Loved it",
      visibility: "public" as const,
      version: 1,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const repos = makeRepositories({
      rankings: {
        upsert: vi.fn(),
        findById: vi.fn().mockResolvedValue(session),
        findByOwnerAndBook: vi.fn(),
        listByOwner: vi.fn().mockResolvedValue([session]),
        delete: vi.fn(),
        startBucket: vi.fn(),
      },
      reviews: {
        findById: vi.fn(),
        create: vi.fn().mockResolvedValue(mockReview),
        update: vi.fn(),
        delete: vi.fn(),
      },
      activity: { append: vi.fn(), getFriendFeed: vi.fn(), getFriendFeedGrouped: vi.fn(), deleteByReviewId: vi.fn() },
    });
    const cache = makeCache(store);
    const app = buildApp(makeIdentity(), repos, cache);

    const res = await app.request("/trpc/ranking.compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rankingId: RANKING_ID, reviewBody: "Loved it" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.done).toBe(true);
    expect(body.result.data.reviewId).toBe(REVIEW_ID);
    expect(repos.reviews.create).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: "public" })
    );
  });

  it("rerank compare flow publishes book_ranked activity event on completion", async () => {
    const session = makeRankingSession();
    const singleExisting = [
      makeRanking({ id: "00000000-0000-0000-0000-000000000010", profileId: UUID1, bookId: BOOK_A, position: 1, bucket: 3 }),
    ];
    const store = new Map<string, unknown>();
    // Pre-seed the cache with isRerank=true
    store.set(`compare:${RANKING_ID}`, {
      ownerId: UUID1,
      bookId: NEW_BOOK_ID,
      bucket: 3,
      rankedIds: [BOOK_A],
      lo: 0,
      hi: 1,
      isRerank: true,
    });

    const rankingResult = makeRanking({ id: "00000000-0000-0000-0000-000000000020", profileId: UUID1, bookId: NEW_BOOK_ID, position: 0, score: 10 });
    const repos = makeRepositories({
      rankings: {
        upsert: vi.fn().mockResolvedValue(rankingResult),
        findById: vi.fn().mockResolvedValue(session),
        findByOwnerAndBook: vi.fn().mockResolvedValue(session),
        listByOwner: vi.fn().mockResolvedValue([session, ...singleExisting]),
        delete: vi.fn(),
        startBucket: vi.fn(),
      },
      activity: { append: vi.fn().mockResolvedValue({ id: "evt-1", actorId: UUID1, verb: "book_ranked", bookId: NEW_BOOK_ID, visibility: "followers", occurredAt: NOW, scoreAtPublish: 10, scoreLockedAtPublish: true }), getFriendFeed: vi.fn(), getFriendFeedGrouped: vi.fn(), deleteByReviewId: vi.fn() },
    });
    const cache = makeCache(store);
    const app = buildApp(makeIdentity(), repos, cache);

    // winner=existing -> hi = mid = 0, so lo=0 >= hi=0 -> done
    const res = await app.request("/trpc/ranking.compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rankingId: RANKING_ID, winner: "existing" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.done).toBe(true);
    // finishRerank called -> upsert and activity.append invoked
    expect(repos.rankings.upsert).toHaveBeenCalled();
    expect(repos.activity.append).toHaveBeenCalledWith(
      expect.objectContaining({ verb: "book_ranked", bookId: NEW_BOOK_ID })
    );
  });
});

describe("ranking.rerank", () => {
  const BOOK_ID = UUID2;
  const RANKING_ID = UUID1;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    const repos = makeRepositories();
    const app = buildApp(null, repos);
    const res = await app.request("/trpc/ranking.rerank", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId: BOOK_ID, version: 1, bucket: 3 }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when ranking does not exist for the book", async () => {
    const repos = makeRepositories({
      rankings: {
        upsert: vi.fn(),
        findById: vi.fn(),
        findByOwnerAndBook: vi.fn().mockResolvedValue(null),
        listByOwner: vi.fn().mockResolvedValue([]),
        delete: vi.fn(),
        startBucket: vi.fn(),
      },
    });
    const cache = makeCache();
    const app = buildApp(makeIdentity(), repos, cache);
    const res = await app.request("/trpc/ranking.rerank", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId: BOOK_ID, version: 1, bucket: 3 }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 409 when version does not match (optimistic locking)", async () => {
    const existing = makeRanking({ id: RANKING_ID, profileId: UUID1, bookId: BOOK_ID, version: 2 });
    const repos = makeRepositories({
      rankings: {
        upsert: vi.fn(),
        findById: vi.fn(),
        findByOwnerAndBook: vi.fn().mockResolvedValue(existing),
        listByOwner: vi.fn().mockResolvedValue([existing]),
        delete: vi.fn(),
        startBucket: vi.fn(),
      },
    });
    const cache = makeCache();
    const app = buildApp(makeIdentity(), repos, cache);
    const res = await app.request("/trpc/ranking.rerank", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId: BOOK_ID, version: 1, bucket: 3 }),
    });
    expect(res.status).toBe(409);
  });

  it("returns rankingId, bookId, and bucket on success", async () => {
    const existing = makeRanking({ id: RANKING_ID, profileId: UUID1, bookId: BOOK_ID, version: 1, bucket: 4 });
    const updated = makeRanking({ id: RANKING_ID, profileId: UUID1, bookId: BOOK_ID, version: 1, bucket: 3 });
    const repos = makeRepositories({
      rankings: {
        upsert: vi.fn(),
        findById: vi.fn(),
        findByOwnerAndBook: vi.fn().mockResolvedValue(existing),
        listByOwner: vi.fn().mockResolvedValue([existing]),
        delete: vi.fn(),
        startBucket: vi.fn().mockResolvedValue(updated),
      },
    });
    const cache = makeCache();
    const app = buildApp(makeIdentity(), repos, cache);
    const res = await app.request("/trpc/ranking.rerank", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId: BOOK_ID, version: 1, bucket: 3 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.rankingId).toBe(RANKING_ID);
    expect(body.result.data.bookId).toBe(BOOK_ID);
    expect(body.result.data.bucket).toBe(3);
  });

  it("pre-seeds comparison state with isRerank=true in cache", async () => {
    const existing = makeRanking({ id: RANKING_ID, profileId: UUID1, bookId: BOOK_ID, version: 1, bucket: 4 });
    const updated = makeRanking({ id: RANKING_ID, profileId: UUID1, bookId: BOOK_ID, version: 1, bucket: 3 });
    const store = new Map<string, unknown>();
    const repos = makeRepositories({
      rankings: {
        upsert: vi.fn(),
        findById: vi.fn(),
        findByOwnerAndBook: vi.fn().mockResolvedValue(existing),
        listByOwner: vi.fn().mockResolvedValue([existing]),
        delete: vi.fn(),
        startBucket: vi.fn().mockResolvedValue(updated),
      },
    });
    const cache = makeCache(store);
    const app = buildApp(makeIdentity(), repos, cache);
    await app.request("/trpc/ranking.rerank", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId: BOOK_ID, version: 1, bucket: 3 }),
    });

    const cached = store.get(`compare:${RANKING_ID}`) as { isRerank?: boolean };
    expect(cached).toBeDefined();
    expect(cached.isRerank).toBe(true);
  });

  it("rejects invalid bookId", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request("/trpc/ranking.rerank", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId: "not-a-uuid", version: 1, bucket: 3 }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects bucket below 1", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request("/trpc/ranking.rerank", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId: BOOK_ID, version: 1, bucket: 0 }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects bucket above 5", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request("/trpc/ranking.rerank", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId: BOOK_ID, version: 1, bucket: 6 }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects non-positive version", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request("/trpc/ranking.rerank", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId: BOOK_ID, version: 0, bucket: 3 }),
    });
    expect(res.status).toBe(400);
  });
});
