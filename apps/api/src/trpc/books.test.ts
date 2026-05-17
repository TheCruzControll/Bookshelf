import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { trpcServer } from "@hono/trpc-server";
import { createTrpcContext } from "./context";
import { router } from "./trpc";
import { booksRouter } from "./books";
import type { AppRepositories, AuthIdentity, Book, Edition } from "@hone/domain";

vi.mock("@hone/observability", () => ({
  captureException: vi.fn(),
  createLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn() })),
  initSentry: vi.fn(),
  setSentryUser: vi.fn(),
  clearSentryUser: vi.fn(),
}));

const UUID1 = "00000000-0000-0000-0000-000000000001";
const BOOK_ID = "00000000-0000-0000-0000-000000000100";
const EDITION_ID = "00000000-0000-0000-0000-000000000101";
const NOW = new Date("2026-05-17T00:00:00Z");

function makeBook(overrides?: Partial<Book>): Book {
  return {
    id: BOOK_ID,
    canonicalTitle: "Manual Title",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeEdition(overrides?: Partial<Edition>): Edition {
  return {
    id: EDITION_ID,
    bookId: BOOK_ID,
    title: "Manual Title",
    source: "manual",
    ...overrides,
  };
}

function makeRepositories(overrides?: Partial<AppRepositories>): AppRepositories {
  return {
    accountDeletions: { create: vi.fn(), findByProfileId: vi.fn().mockResolvedValue(null), delete: vi.fn(), listExpired: vi.fn().mockResolvedValue([]), purgeProfile: vi.fn() },
    deletedProfileTombstones: { create: vi.fn(), findByHandle: vi.fn().mockResolvedValue(null), purgeExpired: vi.fn().mockResolvedValue(0) },
    profiles: { findById: vi.fn(), findByHandle: vi.fn(), create: vi.fn(), isHandleTaken: vi.fn(), setHandle: vi.fn() },
    books: {
      findBookById: vi.fn(),
      findEditionByIsbn: vi.fn(),
      findBookByIsbn13: vi.fn().mockResolvedValue(null),
      search: vi.fn(),
      upsertFromCatalogResult: vi.fn(),
      createManual: vi.fn().mockResolvedValue({ book: makeBook(), edition: makeEdition() }),
      ...overrides?.books,
    },
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
    follows: { follow: vi.fn(), unfollow: vi.fn(), findFollow: vi.fn(), listFollowers: vi.fn(), listFollowing: vi.fn(), isMutual: vi.fn(), countMutuals: vi.fn(), listMutualIds: vi.fn().mockResolvedValue([]), listFriendsOfFriends: vi.fn().mockResolvedValue([]) },
    blocks: { block: vi.fn(), unblock: vi.fn(), findBlock: vi.fn(), listBlockedByUser: vi.fn(), listBlockingUser: vi.fn(), isBlocked: vi.fn(), migrateBlocksAgainstToHash: vi.fn().mockResolvedValue(0), findAgainstHashEntries: vi.fn().mockResolvedValue([]), createMany: vi.fn().mockResolvedValue(0) },
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
  return { userId: UUID1, ...overrides };
}

function buildApp(identity: AuthIdentity | null, repositories: AppRepositories) {
  const testRouter = router({ books: booksRouter });
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

describe("books.createManual", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    const repos = makeRepositories();
    const app = buildApp(null, repos);

    const res = await app.request("/trpc/books.createManual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Gatsby",
        authors: ["Fitzgerald"],
      }),
    });

    expect(res.status).toBe(401);
    expect(repos.books.createManual).not.toHaveBeenCalled();
  });

  it("creates a manual book + edition for the authenticated viewer", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);

    const res = await app.request("/trpc/books.createManual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Gatsby",
        authors: ["Fitzgerald"],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.book.id).toBe(BOOK_ID);
    expect(body.result.data.edition.source).toBe("manual");
    expect(repos.books.createManual).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Gatsby", authors: ["Fitzgerald"] })
    );
  });

  it("normalizes ISBN-10 input to ISBN-13 before persisting", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);

    const res = await app.request("/trpc/books.createManual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Gatsby",
        authors: ["Fitzgerald"],
        isbn: "0743273567",
      }),
    });

    expect(res.status).toBe(200);
    expect(repos.books.createManual).toHaveBeenCalledWith(
      expect.objectContaining({ isbn13: "9780743273565" })
    );
  });

  it("passes year and coverUrl through to the repo when supplied", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);

    await app.request("/trpc/books.createManual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Gatsby",
        authors: ["Fitzgerald"],
        year: 1925,
        coverUrl: "https://example.com/g.jpg",
      }),
    });

    expect(repos.books.createManual).toHaveBeenCalledWith(
      expect.objectContaining({
        firstPublishedYear: 1925,
        coverUrl: "https://example.com/g.jpg",
      })
    );
  });

  it("rejects an empty title with 400", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);

    const res = await app.request("/trpc/books.createManual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "",
        authors: ["Fitzgerald"],
      }),
    });

    expect(res.status).toBe(400);
    expect(repos.books.createManual).not.toHaveBeenCalled();
  });

  it("rejects an empty authors array with 400", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);

    const res = await app.request("/trpc/books.createManual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Gatsby",
        authors: [],
      }),
    });

    expect(res.status).toBe(400);
    expect(repos.books.createManual).not.toHaveBeenCalled();
  });

  it("rejects an invalid ISBN with 400 (service-layer validation)", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);

    const res = await app.request("/trpc/books.createManual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Gatsby",
        authors: ["Fitzgerald"],
        // valid length, invalid checksum
        isbn: "9780743273566",
      }),
    });

    expect(res.status).toBe(400);
    expect(repos.books.createManual).not.toHaveBeenCalled();
  });

  it("rejects an ISBN with bad length with 400 (schema-layer validation)", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);

    const res = await app.request("/trpc/books.createManual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Gatsby",
        authors: ["Fitzgerald"],
        isbn: "12345",
      }),
    });

    expect(res.status).toBe(400);
    expect(repos.books.createManual).not.toHaveBeenCalled();
  });
});
