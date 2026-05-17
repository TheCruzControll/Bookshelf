import { describe, it, expect, vi } from "vitest";
import { createApi } from "./app";
import type { AppRepositories, AuthProvider } from "@hone/domain";

function makeShelfItem() {
  const now = new Date();
  return {
    id: "00000000-0000-0000-0000-000000000010",
    shelfId: "00000000-0000-0000-0000-000000000002",
    bookId: "00000000-0000-0000-0000-000000000003",
    status: "finished" as const,
    addedAt: now,
    updatedAt: now
  };
}

function makeRepositories(): AppRepositories {
  return {
    accountDeletions: { create: vi.fn(), findByProfileId: vi.fn().mockResolvedValue(null), delete: vi.fn(), listExpired: vi.fn().mockResolvedValue([]), purgeProfile: vi.fn() },
    profiles: { findById: vi.fn(), findByHandle: vi.fn(), create: vi.fn(), isHandleTaken: vi.fn(), setHandle: vi.fn() },
    books: { findBookById: vi.fn(), findEditionByIsbn: vi.fn(), findBookByIsbn13: vi.fn().mockResolvedValue(null), search: vi.fn(), upsertFromCatalogResult: vi.fn(), createManual: vi.fn() },
    shelves: {
      listShelves: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      addBook: vi.fn().mockResolvedValue(makeShelfItem()),
      rankShelfItem: vi.fn(),
      createSystemShelves: vi.fn().mockResolvedValue([]),
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
      append: vi.fn().mockResolvedValue({ id: "evt-1", actorId: "u1", verb: "book_added", visibility: "followers", occurredAt: new Date() }),
      getFriendFeed: vi.fn(),
      getFriendFeedGrouped: vi.fn(),
      deleteByReviewId: vi.fn(),
      listByActor: vi.fn().mockResolvedValue([])
    },
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
  };
}

describe("api smoke test", () => {
  it("createApi returns a Hono app with a /health endpoint", async () => {
    const app = createApi();
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, service: "hone-api" });
  });

  it("POST /shelves/books returns 503 when dependencies are not configured", async () => {
    const app = createApi();
    const res = await app.request("/shelves/books", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ownerId: "00000000-0000-0000-0000-000000000001",
        shelfId: "00000000-0000-0000-0000-000000000002",
        bookId: "00000000-0000-0000-0000-000000000003"
      })
    });
    expect(res.status).toBe(503);
  });

  it("POST /shelves/books returns 201 with shelfItem when dependencies are configured", async () => {
    const repositories = makeRepositories();
    const auth: AuthProvider = {
      getCurrentIdentity: vi.fn().mockResolvedValue({ userId: "00000000-0000-0000-0000-000000000001" })
    };
    const app = createApi({ repositories, auth });

    const res = await app.request("/shelves/books", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ownerId: "00000000-0000-0000-0000-000000000001",
        shelfId: "00000000-0000-0000-0000-000000000002",
        bookId: "00000000-0000-0000-0000-000000000003"
      })
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty("shelfItem");
    expect(body.shelfItem.id).toBe("00000000-0000-0000-0000-000000000010");
  });

  it("auth middleware sets Sentry user when identity is present", async () => {
    const repositories = makeRepositories();
    const auth: AuthProvider = {
      getCurrentIdentity: vi.fn().mockResolvedValue({
        userId: "00000000-0000-0000-0000-000000000001",
        email: "user@example.com"
      })
    };
    const app = createApi({ repositories, auth });

    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(auth.getCurrentIdentity).toHaveBeenCalled();
  });

  it("auth middleware clears Sentry user when no identity", async () => {
    const auth: AuthProvider = {
      getCurrentIdentity: vi.fn().mockResolvedValue(null)
    };
    const app = createApi({ auth });

    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(auth.getCurrentIdentity).toHaveBeenCalled();
  });

  it("auth middleware sets Sentry user without email when email is undefined", async () => {
    const repositories = makeRepositories();
    const auth: AuthProvider = {
      getCurrentIdentity: vi.fn().mockResolvedValue({
        userId: "00000000-0000-0000-0000-000000000001"
      })
    };
    const app = createApi({ repositories, auth });

    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(auth.getCurrentIdentity).toHaveBeenCalled();
  });
});
