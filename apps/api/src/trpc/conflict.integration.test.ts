import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { trpcServer } from "@hono/trpc-server";
import { createTrpcContext } from "./context";
import { router } from "./trpc";
import { reviewRouter } from "./review";
import { shelfRouter } from "./shelf";
import { shelfItemRouter } from "./shelf-item";
import type {
  AppRepositories,
  AuthIdentity,
  Review,
  Shelf,
  ShelfItem,
} from "@hone/domain";

/**
 * T-03 (#164) — Two-client conflict simulation tests.
 *
 * These tests exercise the hybrid multi-device conflict resolution model
 * documented in docs/prd-backlog.md "Multi-Device Conflict Resolution":
 *
 *   - State changes (shelf moves) → last-writer-wins (LWW). Both writes
 *     succeed; the final state matches the latest write.
 *   - Authored content (review/list edits) → optimistic locking. Stale
 *     versions return 409 CONFLICT; the underlying value reflects the
 *     winning writer's edit.
 *
 * Each test simulates two concurrent clients (A and B) acting on the same
 * resource. The test sequence is serialized (B's request runs after A's
 * completes) but represents the system's view of two clients that both
 * observed the same starting state and then issued writes.
 */

vi.mock("@hone/observability", () => ({
  captureException: vi.fn(),
  createLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn() })),
  initSentry: vi.fn(),
  setSentryUser: vi.fn(),
  clearSentryUser: vi.fn(),
}));

const OWNER_ID = "00000000-0000-0000-0000-0000000000a1";
const SHELF_WTR_ID = "00000000-0000-0000-0000-0000000000b1";
const SHELF_READING_ID = "00000000-0000-0000-0000-0000000000b2";
const SHELF_LIST_ID = "00000000-0000-0000-0000-0000000000b3";
const BOOK_ID = "00000000-0000-0000-0000-0000000000c1";
const REVIEW_ID = "00000000-0000-0000-0000-0000000000d1";
const SHELF_ITEM_ID = "00000000-0000-0000-0000-0000000000e1";
const NOW = new Date("2026-05-16T00:00:00Z");

function makeShelf(overrides?: Partial<Shelf>): Shelf {
  return {
    id: SHELF_WTR_ID,
    ownerId: OWNER_ID,
    name: "Want to Read",
    slug: "want-to-read",
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
    id: SHELF_ITEM_ID,
    shelfId: SHELF_WTR_ID,
    bookId: BOOK_ID,
    status: "want_to_read",
    position: 0,
    addedAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as ShelfItem;
}

function makeReview(overrides?: Partial<Review>): Review {
  return {
    id: REVIEW_ID,
    authorId: OWNER_ID,
    bookId: BOOK_ID,
    body: "Initial body",
    visibility: "public",
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeRepositories(overrides?: Partial<AppRepositories>): AppRepositories {
  return {
    accountDeletions: {
      create: vi.fn(),
      findByProfileId: vi.fn().mockResolvedValue(null),
      delete: vi.fn(),
      listExpired: vi.fn().mockResolvedValue([]),
      purgeProfile: vi.fn(),
    },
    deletedProfileTombstones: {
      create: vi.fn(),
      findByHandle: vi.fn().mockResolvedValue(null),
      purgeExpired: vi.fn().mockResolvedValue(0),
    },
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
      findShelfItem: vi.fn().mockResolvedValue(null),
      upsertShelfItem: vi.fn(),
      deleteShelfItem: vi.fn(),
      getMaxPosition: vi.fn().mockResolvedValue(0),
      moveShelfItem: vi.fn(),
      listOwnersWithBookOnSystemShelf: vi.fn().mockResolvedValue([]),
      listShelfItemsByOwner: vi.fn().mockResolvedValue([]),
      ...overrides?.shelves,
    },
    reviews: {
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      ...overrides?.reviews,
    },
    activity: {
      append: vi.fn().mockResolvedValue(undefined),
      getFriendFeed: vi.fn(),
      getFriendFeedGrouped: vi.fn(),
      deleteByReviewId: vi.fn().mockResolvedValue(undefined),
      listByActor: vi.fn().mockResolvedValue([]),
    },
    recommendations: { getForUser: vi.fn() },
    follows: {
      follow: vi.fn(),
      unfollow: vi.fn(),
      findFollow: vi.fn(),
      listFollowers: vi.fn(),
      listFollowing: vi.fn(),
      isMutual: vi.fn(),
      countMutuals: vi.fn().mockResolvedValue(0),
      listMutualIds: vi.fn().mockResolvedValue([]),
      listFriendsOfFriends: vi.fn().mockResolvedValue([]),
    },
    blocks: {
      block: vi.fn(),
      unblock: vi.fn(),
      findBlock: vi.fn(),
      listBlockedByUser: vi.fn(),
      listBlockingUser: vi.fn(),
      isBlocked: vi.fn(),
    },
    rankings: {
      upsert: vi.fn(),
      findById: vi.fn(),
      findByOwnerAndBook: vi.fn(),
      listByOwner: vi.fn(),
      delete: vi.fn(),
      startBucket: vi.fn(),
    },
    notifications: {
      registerToken: vi.fn(),
      removeToken: vi.fn(),
      listTokensForProfile: vi.fn(),
      getSetting: vi.fn(),
      setSetting: vi.fn(),
      listSettings: vi.fn(),
    },
    imports: {
      create: vi.fn(),
      findById: vi.fn(),
      findByOwnerAndHash: vi.fn(),
      listByOwner: vi.fn(),
      updateStatus: vi.fn(),
    },
    contacts: {
      upsertHashes: vi.fn(),
      findMatches: vi.fn(),
      findMatchingProfilesByPhone: vi.fn(),
      deleteForUser: vi.fn(),
      deleteExpired: vi.fn(),
      expireBySaltVersion: vi.fn(),
      deleteByTargetHash: vi.fn(),
      listByUser: vi.fn(),
    },
    emailIndex: {
      upsertHashes: vi.fn(),
      findMatches: vi.fn(),
      deleteForUser: vi.fn(),
      deleteExpired: vi.fn(),
      expireBySaltVersion: vi.fn(),
      deleteByTargetHash: vi.fn(),
      listByUser: vi.fn(),
    },
    lists: {
      create: vi.fn(),
      findById: vi.fn(),
      listByOwner: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      addItem: vi.fn(),
      removeItem: vi.fn(),
      listItems: vi.fn(),
      reorderItems: vi.fn(),
    },
    authIdentities: { create: vi.fn(), findByProvider: vi.fn(), listByProfile: vi.fn() },
    sessions: {
      create: vi.fn(),
      findByTokenHash: vi.fn(),
      revokeByTokenHash: vi.fn(),
      revokeAllForProfile: vi.fn(),
    },
    handleHistory: { record: vi.fn(), findCurrentByOldHandle: vi.fn() },
    magicLinks: {
      create: vi.fn(),
      findByTokenHash: vi.fn(),
      markConsumed: vi.fn(),
      deleteExpiredForEmail: vi.fn(),
    },
    inAppNotifications: {
      list: vi.fn().mockResolvedValue([]),
      markRead: vi.fn().mockResolvedValue(undefined),
      findById: vi.fn(),
      countSince: vi.fn().mockResolvedValue(0),
      countSinceByActor: vi.fn().mockResolvedValue(0),
      create: vi.fn(),
        listAllByRecipient: vi.fn().mockResolvedValue([]),
    },
    phoneVerifications: {
      upsert: vi.fn(),
      findByPhone: vi.fn(),
      incrementAttempts: vi.fn(),
      deleteByPhone: vi.fn(),
      deleteExpired: vi.fn(),
    },
    phoneNumbers: { upsert: vi.fn(), findByProfileId: vi.fn(), findByHash: vi.fn() },
    salts: {
      create: vi.fn(),
      findActive: vi.fn(),
      findByVersion: vi.fn(),
      retire: vi.fn(),
      getLatestVersion: vi.fn(),
      listAll: vi.fn(),
    },
    ...overrides,
  };
}

function makeIdentity(overrides?: Partial<AuthIdentity>): AuthIdentity {
  return { userId: OWNER_ID, ...overrides };
}

function buildApp(identity: AuthIdentity | null, repositories: AppRepositories) {
  const testRouter = router({
    review: reviewRouter,
    shelf: shelfRouter,
    shelfItem: shelfItemRouter,
  });
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

// ---------------------------------------------------------------------------
// LWW — shelf-item move (state change, no version check)
// ---------------------------------------------------------------------------

describe("two-client conflict: LWW on shelf-item move", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deterministic LWW outcome: B's later move wins over A's earlier move", async () => {
    // Both clients observe the book on "Want to Read" at position 0.
    // Client A moves it to "Reading" (position 0), then client B moves the
    // same book to position 5 in "Reading". The latest write wins; both
    // requests succeed (no 409, no version check on this state change).
    const initialItem = makeShelfItem({
      shelfId: SHELF_WTR_ID,
      bookId: BOOK_ID,
      status: "want_to_read",
      position: 0,
    });
    const afterA = makeShelfItem({
      shelfId: SHELF_READING_ID,
      bookId: BOOK_ID,
      status: "reading",
      position: 0,
      updatedAt: new Date(NOW.getTime() + 1000),
    });
    const afterB = makeShelfItem({
      shelfId: SHELF_READING_ID,
      bookId: BOOK_ID,
      status: "reading",
      position: 5,
      updatedAt: new Date(NOW.getTime() + 2000),
    });

    // The repository reflects the most recent write each time move is called.
    let currentItem: ShelfItem = initialItem;
    const moveShelfItem = vi
      .fn()
      .mockImplementationOnce(async () => {
        currentItem = afterA;
        return afterA;
      })
      .mockImplementationOnce(async () => {
        currentItem = afterB;
        return afterB;
      });
    const findShelfItem = vi.fn(async () => currentItem);
    const readingShelf = makeShelf({
      id: SHELF_READING_ID,
      name: "Reading",
      slug: "reading",
      isSystem: true,
    });

    const repos = makeRepositories({
      shelves: {
        ...makeRepositories().shelves,
        findById: vi.fn().mockResolvedValue(readingShelf),
        findShelfItem,
        moveShelfItem,
      },
    });
    const app = buildApp(makeIdentity({ userId: OWNER_ID }), repos);

    // Client A: move to "Reading" position 0.
    const resA = await app.request("/trpc/shelfItem.move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shelfId: SHELF_READING_ID,
        bookId: BOOK_ID,
        position: 0,
      }),
    });
    expect(resA.status).toBe(200);
    const bodyA = await resA.json();
    expect(bodyA.result.data.shelfItem.position).toBe(0);

    // Client B: move to "Reading" position 5 (later, same starting POV).
    const resB = await app.request("/trpc/shelfItem.move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shelfId: SHELF_READING_ID,
        bookId: BOOK_ID,
        position: 5,
      }),
    });
    expect(resB.status).toBe(200);
    const bodyB = await resB.json();

    // Both writes succeed deterministically (no 409 anywhere).
    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);

    // Final state matches the latest write (B): position 5.
    expect(bodyB.result.data.shelfItem.position).toBe(5);
    expect(currentItem.position).toBe(5);

    // Repository was hit exactly twice; both writes were committed.
    expect(moveShelfItem).toHaveBeenCalledTimes(2);
    expect(moveShelfItem).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ position: 0 })
    );
    expect(moveShelfItem).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ position: 5 })
    );
  });

  it("LWW outcome is order-sensitive: reverse the order, A wins", async () => {
    // Same scenario, swapped sequence. Confirms the result is determined by
    // commit order, not by anything in the request payload.
    const initialItem = makeShelfItem({ position: 0 });
    const afterB = makeShelfItem({
      shelfId: SHELF_READING_ID,
      position: 5,
      status: "reading",
      updatedAt: new Date(NOW.getTime() + 1000),
    });
    const afterA = makeShelfItem({
      shelfId: SHELF_READING_ID,
      position: 0,
      status: "reading",
      updatedAt: new Date(NOW.getTime() + 2000),
    });

    let currentItem: ShelfItem = initialItem;
    const moveShelfItem = vi
      .fn()
      .mockImplementationOnce(async () => {
        currentItem = afterB;
        return afterB;
      })
      .mockImplementationOnce(async () => {
        currentItem = afterA;
        return afterA;
      });
    const findShelfItem = vi.fn(async () => currentItem);
    const readingShelf = makeShelf({
      id: SHELF_READING_ID,
      name: "Reading",
      slug: "reading",
      isSystem: true,
    });

    const repos = makeRepositories({
      shelves: {
        ...makeRepositories().shelves,
        findById: vi.fn().mockResolvedValue(readingShelf),
        findShelfItem,
        moveShelfItem,
      },
    });
    const app = buildApp(makeIdentity({ userId: OWNER_ID }), repos);

    // Client B commits first.
    const resB = await app.request("/trpc/shelfItem.move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shelfId: SHELF_READING_ID,
        bookId: BOOK_ID,
        position: 5,
      }),
    });
    expect(resB.status).toBe(200);

    // Client A commits last → A wins.
    const resA = await app.request("/trpc/shelfItem.move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shelfId: SHELF_READING_ID,
        bookId: BOOK_ID,
        position: 0,
      }),
    });
    expect(resA.status).toBe(200);
    const bodyA = await resA.json();

    expect(bodyA.result.data.shelfItem.position).toBe(0);
    expect(currentItem.position).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Optimistic locking — review edit (409 on stale version)
// ---------------------------------------------------------------------------

describe("two-client conflict: optimistic locking on review edit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 409 CONFLICT when client B submits a stale version", async () => {
    // Both clients fetch the review at version 1. Client A edits and the
    // server bumps it to v2. Client B then submits an edit with version 1
    // (stale) and must receive 409 CONFLICT. The underlying review must
    // still reflect A's edit, not B's stale write.
    const v1 = makeReview({ version: 1, body: "Initial body" });
    const v2 = makeReview({
      version: 2,
      body: "A's edit",
      updatedAt: new Date(NOW.getTime() + 1000),
    });

    // The mocked repo's findById returns whatever's "currently committed".
    // After A commits at v2, findById returns the v2 row so B's stale check
    // resolves correctly inside the service.
    let committed: Review = v1;
    const findById = vi.fn(async () => committed);
    const update = vi.fn(async () => {
      committed = v2;
      return v2;
    });

    const repos = makeRepositories({
      reviews: { findById, create: vi.fn(), update, delete: vi.fn(), listByAuthor: vi.fn().mockResolvedValue([]) },
    });
    const app = buildApp(makeIdentity({ userId: OWNER_ID }), repos);

    // Client A: edit at version 1 → 200, bumps to v2.
    const resA = await app.request("/trpc/review.update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: REVIEW_ID, version: 1, body: "A's edit" }),
    });
    expect(resA.status).toBe(200);
    const bodyA = await resA.json();
    expect(bodyA.result.data.review.body).toBe("A's edit");
    expect(bodyA.result.data.review.version).toBe(2);

    // Client B: edit at stale version 1 → 409.
    const resB = await app.request("/trpc/review.update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: REVIEW_ID, version: 1, body: "B's stale edit" }),
    });
    expect(resB.status).toBe(409);
    const bodyB = await resB.json();
    expect(bodyB.error.data.code).toBe("CONFLICT");

    // The repository update was only called once (for A); B's stale write
    // was rejected before reaching it.
    expect(update).toHaveBeenCalledTimes(1);
    expect(committed.body).toBe("A's edit");
    expect(committed.version).toBe(2);
  });

  it("includes the typed conflict payload (data.conflict) so clients can offer manual merge", async () => {
    // The 409 wire shape includes data.conflict per #163, carrying the
    // current value and version. Verify both clients can recover from
    // the conflict without a follow-up fetch.
    const v2 = makeReview({
      version: 2,
      body: "A's edit",
      updatedAt: new Date(NOW.getTime() + 1000),
    });
    const findById = vi.fn().mockResolvedValue(v2);
    const update = vi.fn();
    const repos = makeRepositories({
      reviews: { findById, create: vi.fn(), update, delete: vi.fn(), listByAuthor: vi.fn().mockResolvedValue([]) },
    });
    const app = buildApp(makeIdentity({ userId: OWNER_ID }), repos);

    const res = await app.request("/trpc/review.update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: REVIEW_ID, version: 1, body: "B's stale edit" }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.data.code).toBe("CONFLICT");
    // The typed payload exposes the resource discriminator and current version.
    expect(body.error.data.conflict).toMatchObject({
      code: "VERSION_CONFLICT",
      resource: "review",
      currentVersion: 2,
    });
    // The conflict payload echoes the canonical current value so the client
    // can render a manual-merge prompt without another round trip.
    expect(body.error.data.conflict.currentValue.body).toBe("A's edit");
    // B's write never reached the repository.
    expect(update).not.toHaveBeenCalled();
  });

  it("sequential successful edits keep bumping the version (no conflict when both clients re-fetch)", async () => {
    // Confirms the positive case as a control: when client B refetches
    // before editing, both writes succeed and the version monotonically
    // increases. This is what client recovery from a 409 should look like
    // after the manual-merge prompt.
    const v1 = makeReview({ version: 1, body: "Initial body" });
    const v2 = makeReview({
      version: 2,
      body: "A's edit",
      updatedAt: new Date(NOW.getTime() + 1000),
    });
    const v3 = makeReview({
      version: 3,
      body: "B's merged edit",
      updatedAt: new Date(NOW.getTime() + 2000),
    });

    let committed: Review = v1;
    const findById = vi.fn(async () => committed);
    const update = vi
      .fn()
      .mockImplementationOnce(async () => {
        committed = v2;
        return v2;
      })
      .mockImplementationOnce(async () => {
        committed = v3;
        return v3;
      });

    const repos = makeRepositories({
      reviews: { findById, create: vi.fn(), update, delete: vi.fn(), listByAuthor: vi.fn().mockResolvedValue([]) },
    });
    const app = buildApp(makeIdentity({ userId: OWNER_ID }), repos);

    // Client A edits at v1.
    const resA = await app.request("/trpc/review.update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: REVIEW_ID, version: 1, body: "A's edit" }),
    });
    expect(resA.status).toBe(200);

    // Client B re-fetches (committed is now v2), then edits at v2.
    const resB = await app.request("/trpc/review.update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: REVIEW_ID, version: 2, body: "B's merged edit" }),
    });
    expect(resB.status).toBe(200);
    const bodyB = await resB.json();
    expect(bodyB.result.data.review.version).toBe(3);
    expect(committed.body).toBe("B's merged edit");
  });
});

// ---------------------------------------------------------------------------
// Optimistic locking — list (shelf-of-kind-list) edit (409 on stale version)
// ---------------------------------------------------------------------------

describe("two-client conflict: optimistic locking on list/shelf edit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 409 CONFLICT when client B submits a stale shelf version", async () => {
    // Lists in v1 are shelves of kind="list"; their metadata edit path is
    // shelf.update, which throws VERSION_CONFLICT on stale versions per
    // #163. Same two-client scenario as the review test.
    const v1 = makeShelf({
      id: SHELF_LIST_ID,
      kind: "list",
      name: "My Favorite Sci-Fi",
      version: 1,
    });
    const v2 = makeShelf({
      id: SHELF_LIST_ID,
      kind: "list",
      name: "A's renamed list",
      version: 2,
      updatedAt: new Date(NOW.getTime() + 1000),
    });

    let committed: Shelf = v1;
    const findById = vi.fn(async () => committed);
    const update = vi.fn(async (input: { version: number }) => {
      if (input.version !== committed.version) {
        throw Object.assign(new Error("Version conflict"), {
          code: "VERSION_CONFLICT",
          currentVersion: committed.version,
          currentShelf: committed,
        });
      }
      committed = { ...v2, name: "A's renamed list" };
      return committed;
    });

    const repos = makeRepositories({
      shelves: {
        ...makeRepositories().shelves,
        findById,
        update,
      },
    });
    const app = buildApp(makeIdentity({ userId: OWNER_ID }), repos);

    // Client A edits at v1 → 200, bumps to v2.
    const resA = await app.request("/trpc/shelf.update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: SHELF_LIST_ID,
        version: 1,
        name: "A's renamed list",
      }),
    });
    expect(resA.status).toBe(200);
    const bodyA = await resA.json();
    expect(bodyA.result.data.shelf.name).toBe("A's renamed list");

    // Client B edits with stale version 1 → 409.
    const resB = await app.request("/trpc/shelf.update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: SHELF_LIST_ID,
        version: 1,
        name: "B's stale rename",
      }),
    });
    expect(resB.status).toBe(409);
    const bodyB = await resB.json();
    expect(bodyB.error.data.code).toBe("CONFLICT");
    // The typed conflict payload identifies the resource and current version.
    expect(bodyB.error.data.conflict).toMatchObject({
      code: "VERSION_CONFLICT",
      resource: "shelf",
      currentVersion: 2,
    });

    // The committed shelf still reflects A's rename, not B's stale write.
    expect(committed.name).toBe("A's renamed list");
    expect(committed.version).toBe(2);
  });
});
