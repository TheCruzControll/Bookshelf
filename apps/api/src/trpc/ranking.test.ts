import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { trpcServer } from "@hono/trpc-server";
import { createTrpcContext } from "./context";
import { router } from "./trpc";
import { rankingRouter } from "./ranking";
import type { AppRepositories, AuthIdentity, Ranking } from "@hone/domain";

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
    profiles: {
      findById: vi.fn(),
      findByHandle: vi.fn(),
      create: vi.fn(),
      isHandleTaken: vi.fn(),
      setHandle: vi.fn(),
    },
    books: { findBookById: vi.fn(), findEditionByIsbn: vi.fn(), search: vi.fn() },
    shelves: { listShelves: vi.fn(), addBook: vi.fn(), rankShelfItem: vi.fn(), createSystemShelves: vi.fn() },
    reviews: { create: vi.fn() },
    activity: { append: vi.fn(), getFriendFeed: vi.fn() },
    recommendations: { getForUser: vi.fn() },
    follows: { follow: vi.fn(), unfollow: vi.fn(), findFollow: vi.fn(), listFollowers: vi.fn(), listFollowing: vi.fn(), isMutual: vi.fn() },
    blocks: { block: vi.fn(), unblock: vi.fn(), findBlock: vi.fn(), listBlockedByUser: vi.fn(), isBlocked: vi.fn() },
    rankings: {
      upsert: vi.fn(),
      findByOwnerAndBook: vi.fn(),
      listByOwner: vi.fn(),
      delete: vi.fn(),
      startBucket: vi.fn().mockResolvedValue(makeRanking()),
      ...overrides?.rankings,
    },
    notifications: { registerToken: vi.fn(), removeToken: vi.fn(), listTokensForUser: vi.fn() },
    imports: { create: vi.fn(), findById: vi.fn(), listByOwner: vi.fn(), updateStatus: vi.fn() },
    contacts: { upsertHashes: vi.fn(), findMatches: vi.fn(), deleteForUser: vi.fn(), deleteExpired: vi.fn(), listByUser: vi.fn() },
    lists: { create: vi.fn(), findById: vi.fn(), listByOwner: vi.fn(), update: vi.fn(), delete: vi.fn(), addItem: vi.fn(), removeItem: vi.fn(), listItems: vi.fn(), reorderItems: vi.fn() },
    sessions: { create: vi.fn(), findById: vi.fn(), deleteById: vi.fn(), deleteAllForUser: vi.fn() },
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
  const testRouter = router({ ranking: rankingRouter });
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

describe("ranking.startBucket", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records bucket and returns rankingId, bookId, and bucket on success", async () => {
    const ranking = makeRanking({ id: UUID1, bookId: UUID2, bucket: 3 });
    const repos = makeRepositories({
      rankings: {
        upsert: vi.fn(),
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
