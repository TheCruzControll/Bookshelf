import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { trpcServer } from "@hono/trpc-server";
import { createTrpcContext } from "./context";
import { router } from "./trpc";
import { reviewRouter } from "./review";
import type { AppRepositories, AuthIdentity, Review } from "@hone/domain";

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

function makeReview(overrides?: Partial<Review>): Review {
  return {
    id: UUID2,
    authorId: UUID1,
    bookId: UUID2,
    body: "A great book",
    visibility: "public",
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
    shelves: {
      listShelves: vi.fn().mockResolvedValue([]),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      addBook: vi.fn(),
      rankShelfItem: vi.fn(),
      createSystemShelves: vi.fn(),
    },
    reviews: {
      create: vi.fn().mockResolvedValue(makeReview()),
      update: vi.fn(),
    },
    activity: { append: vi.fn().mockResolvedValue(undefined), getFriendFeed: vi.fn() },
    recommendations: { getForUser: vi.fn() },
    follows: { follow: vi.fn(), unfollow: vi.fn(), findFollow: vi.fn(), listFollowers: vi.fn(), listFollowing: vi.fn(), isMutual: vi.fn() },
    blocks: { block: vi.fn(), unblock: vi.fn(), findBlock: vi.fn(), listBlockedByUser: vi.fn(), isBlocked: vi.fn() },
    rankings: { upsert: vi.fn(), findById: vi.fn(), findByOwnerAndBook: vi.fn(), listByOwner: vi.fn(), delete: vi.fn(), startBucket: vi.fn() },
    notifications: { registerToken: vi.fn(), removeToken: vi.fn(), listTokensForProfile: vi.fn(), getSetting: vi.fn(), setSetting: vi.fn(), listSettings: vi.fn() },
    imports: { create: vi.fn(), findById: vi.fn(), findByOwnerAndHash: vi.fn(), listByOwner: vi.fn(), updateStatus: vi.fn() },
    contacts: { upsertHashes: vi.fn(), findMatches: vi.fn(), deleteForUser: vi.fn(), deleteExpired: vi.fn(), listByUser: vi.fn() },
    lists: { create: vi.fn(), findById: vi.fn(), listByOwner: vi.fn(), update: vi.fn(), delete: vi.fn(), addItem: vi.fn(), removeItem: vi.fn(), listItems: vi.fn(), reorderItems: vi.fn() },
    authIdentities: { create: vi.fn(), findByProvider: vi.fn(), listByProfile: vi.fn() },
    sessions: { create: vi.fn(), findByTokenHash: vi.fn(), revokeByTokenHash: vi.fn(), revokeAllForProfile: vi.fn() },
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
  const testRouter = router({ review: reviewRouter });
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

describe("review.create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a review with public visibility by default", async () => {
    const review = makeReview({ visibility: "public" });
    const repos = makeRepositories({
      reviews: { create: vi.fn().mockResolvedValue(review), update: vi.fn() },
    });
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request("/trpc/review.create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId: UUID2, body: "A great book" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.review.visibility).toBe("public");
  });

  it("creates a review with followers visibility", async () => {
    const review = makeReview({ visibility: "followers" });
    const repos = makeRepositories({
      reviews: { create: vi.fn().mockResolvedValue(review), update: vi.fn() },
    });
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request("/trpc/review.create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId: UUID2, body: "A great book", visibility: "followers" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.review.visibility).toBe("followers");
  });

  it("creates a review with mutuals visibility", async () => {
    const review = makeReview({ visibility: "mutuals" });
    const repos = makeRepositories({
      reviews: { create: vi.fn().mockResolvedValue(review), update: vi.fn() },
    });
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request("/trpc/review.create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId: UUID2, body: "A great book", visibility: "mutuals" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.review.visibility).toBe("mutuals");
  });

  it("creates a review with private visibility", async () => {
    const review = makeReview({ visibility: "private" });
    const repos = makeRepositories({
      reviews: { create: vi.fn().mockResolvedValue(review), update: vi.fn() },
    });
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request("/trpc/review.create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId: UUID2, body: "A great book", visibility: "private" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.review.visibility).toBe("private");
  });

  it("uses the authenticated user id as authorId", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity({ userId: UUID1 }), repos);
    await app.request("/trpc/review.create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId: UUID2, body: "A great book" }),
    });
    expect(repos.reviews.create).toHaveBeenCalledWith(
      expect.objectContaining({ authorId: UUID1 })
    );
  });

  it("appends a book_reviewed activity event after creating the review", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity({ userId: UUID1 }), repos);
    await app.request("/trpc/review.create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId: UUID2, body: "A great book" }),
    });
    expect(repos.activity.append).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: UUID1,
        verb: "book_reviewed",
        bookId: UUID2,
      })
    );
  });

  it("activity event visibility matches review visibility", async () => {
    const review = makeReview({ visibility: "mutuals" });
    const repos = makeRepositories({
      reviews: { create: vi.fn().mockResolvedValue(review), update: vi.fn() },
    });
    const app = buildApp(makeIdentity({ userId: UUID1 }), repos);
    await app.request("/trpc/review.create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId: UUID2, body: "A great book", visibility: "mutuals" }),
    });
    expect(repos.activity.append).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: "mutuals" })
    );
  });

  it("returns 401 when unauthenticated", async () => {
    const repos = makeRepositories();
    const app = buildApp(null, repos);
    const res = await app.request("/trpc/review.create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId: UUID2, body: "A great book" }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects an empty review body", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request("/trpc/review.create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId: UUID2, body: "" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects an invalid bookId", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request("/trpc/review.create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId: "not-a-uuid", body: "A great book" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns the review id and body in the response", async () => {
    const review = makeReview({ id: UUID2, body: "A great book" });
    const repos = makeRepositories({
      reviews: { create: vi.fn().mockResolvedValue(review), update: vi.fn() },
    });
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request("/trpc/review.create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId: UUID2, body: "A great book" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.review.id).toBe(UUID2);
    expect(body.result.data.review.body).toBe("A great book");
  });
});
