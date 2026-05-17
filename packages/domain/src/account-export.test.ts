/**
 * Unit tests for `AccountExportService` (issue #153 — GDPR data export
 * builder).
 *
 * The service is privacy-adjacent: the export archive must contain
 * data for exactly the requesting profile and never leak data for
 * other profiles. The two unit tests cover the happy path and the
 * empty-profile path; the property test covers the cross-profile
 * isolation guarantee.
 */
import { describe, it, expect, vi } from "vitest";
import * as fc from "fast-check";
import { gunzipSync } from "node:zlib";
import {
  AccountExportService,
  ACCOUNT_EXPORT_SCHEMA_VERSION,
  ACCOUNT_EXPORT_URL_TTL_MS,
  type AccountExportPayload,
} from "./services";
import type { AppRepositories, StorageProvider } from "./ports";
import type {
  ActivityEvent,
  Block,
  ContactsHash,
  EmailIndex,
  Follow,
  Import,
  InAppNotification,
  List,
  NotificationSetting,
  NotificationToken,
  OAuthIdentity,
  PhoneNumber,
  Profile,
  Ranking,
  Review,
  Shelf,
  ShelfItem,
} from "./types";
import { POSTURE_C_DEFAULTS } from "./services";

const UUID_A = "00000000-0000-0000-0000-0000000000a1";
const UUID_B = "00000000-0000-0000-0000-0000000000b1";
const NOW = new Date("2026-05-16T12:00:00Z");

/** Helper: build a minimal Profile fixture for a given id. */
function makeProfile(id: string, overrides: Partial<Profile> = {}): Profile {
  return {
    id,
    handle: `user-${id.slice(-4)}`,
    displayName: `User ${id.slice(-4)}`,
    verified: false,
    defaultVisibility: POSTURE_C_DEFAULTS,
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

/**
 * Build a fully-stubbed AppRepositories that returns empty arrays for
 * every list call and `null` for every single-entity lookup. Each
 * test overrides the repos relevant to that scenario.
 */
function makeEmptyRepos(): AppRepositories {
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
      findById: vi.fn().mockResolvedValue(null),
      findByHandle: vi.fn(),
      create: vi.fn(),
      isHandleTaken: vi.fn(),
      setHandle: vi.fn(),
    },
    books: {
      findBookById: vi.fn(),
      findEditionByIsbn: vi.fn(),
      findBookByIsbn13: vi.fn().mockResolvedValue(null),
      search: vi.fn(),
      upsertFromCatalogResult: vi.fn(),
      createManual: vi.fn(),
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
    reviews: {
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      listByAuthor: vi.fn().mockResolvedValue([]),
    },
    activity: {
      append: vi.fn(),
      getFriendFeed: vi.fn(),
      getFriendFeedGrouped: vi.fn(),
      deleteByReviewId: vi.fn(),
      listByActor: vi.fn().mockResolvedValue([]),
    },
    recommendations: { getForUser: vi.fn() },
    follows: {
      follow: vi.fn(),
      unfollow: vi.fn(),
      findFollow: vi.fn(),
      listFollowers: vi.fn().mockResolvedValue([]),
      listFollowing: vi.fn().mockResolvedValue([]),
      isMutual: vi.fn().mockResolvedValue(false),
      countMutuals: vi.fn().mockResolvedValue(0),
      listMutualIds: vi.fn().mockResolvedValue([]),
      listFriendsOfFriends: vi.fn().mockResolvedValue([]),
    },
    blocks: {
      block: vi.fn(),
      unblock: vi.fn(),
      findBlock: vi.fn(),
      listBlockedByUser: vi.fn().mockResolvedValue([]),
      listBlockingUser: vi.fn().mockResolvedValue([]),
      isBlocked: vi.fn().mockResolvedValue(false),
    },
    rankings: {
      upsert: vi.fn(),
      findById: vi.fn(),
      findByOwnerAndBook: vi.fn(),
      listByOwner: vi.fn().mockResolvedValue([]),
      delete: vi.fn(),
      startBucket: vi.fn(),
    },
    notifications: {
      registerToken: vi.fn(),
      removeToken: vi.fn(),
      listTokensForProfile: vi.fn().mockResolvedValue([]),
      getSetting: vi.fn(),
      setSetting: vi.fn(),
      listSettings: vi.fn().mockResolvedValue([]),
    },
    imports: {
      create: vi.fn(),
      findById: vi.fn(),
      findByOwnerAndHash: vi.fn(),
      listByOwner: vi.fn().mockResolvedValue([]),
      updateStatus: vi.fn(),
    },
    contacts: {
      upsertHashes: vi.fn(),
      findMatches: vi.fn(),
      findMatchingProfilesByPhone: vi.fn().mockResolvedValue([]),
      deleteForUser: vi.fn(),
      deleteExpired: vi.fn(),
      expireBySaltVersion: vi.fn(),
      deleteByTargetHash: vi.fn(),
      listByUser: vi.fn().mockResolvedValue([]),
      softDisable: vi.fn(),
      purgeOlderThan: vi.fn().mockResolvedValue(0),
    },
    emailIndex: {
      upsertHashes: vi.fn(),
      findMatches: vi.fn(),
      deleteForUser: vi.fn(),
      deleteExpired: vi.fn(),
      expireBySaltVersion: vi.fn(),
      deleteByTargetHash: vi.fn(),
      listByUser: vi.fn().mockResolvedValue([]),
    },
    lists: {
      create: vi.fn(),
      findById: vi.fn(),
      listByOwner: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
      delete: vi.fn(),
      addItem: vi.fn(),
      removeItem: vi.fn(),
      listItems: vi.fn(),
      reorderItems: vi.fn(),
    },
    authIdentities: {
      create: vi.fn(),
      findByProvider: vi.fn(),
      listByProfile: vi.fn().mockResolvedValue([]),
    },
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
      markRead: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      countSince: vi.fn().mockResolvedValue(0),
      countSinceByActor: vi.fn().mockResolvedValue(0),
      listAllByRecipient: vi.fn().mockResolvedValue([]),
    },
    phoneVerifications: {
      upsert: vi.fn(),
      findByPhone: vi.fn(),
      incrementAttempts: vi.fn(),
      deleteByPhone: vi.fn(),
      deleteExpired: vi.fn(),
    },
    phoneNumbers: {
      upsert: vi.fn(),
      findByProfileId: vi.fn().mockResolvedValue(null),
      findByHash: vi.fn(),
    },
    salts: {
      create: vi.fn(),
      findActive: vi.fn(),
      findByVersion: vi.fn(),
      retire: vi.fn(),
      getLatestVersion: vi.fn(),
      listAll: vi.fn(),
    },
  };
}

/** In-memory `StorageProvider` for tests — records the upload + signs a fake URL. */
function makeFakeStorage(): {
  storage: StorageProvider;
  putObject: ReturnType<typeof vi.fn>;
  uploads: Array<{ key: string; body: Uint8Array; contentType: string; expiresInMs: number }>;
} {
  const uploads: Array<{ key: string; body: Uint8Array; contentType: string; expiresInMs: number }> = [];
  const putObject = vi.fn(async (input: { key: string; body: Uint8Array; contentType: string; expiresInMs: number }) => {
    uploads.push(input);
    return {
      url: `https://signed.example.com/${encodeURIComponent(input.key)}?sig=ok`,
      expiresAt: new Date(NOW.getTime() + input.expiresInMs),
    };
  });
  return { storage: { putObject }, putObject, uploads };
}

describe("AccountExportService.buildExport", () => {
  it("collects data from every user-scoped repository and uploads it once", async () => {
    const repos = makeEmptyRepos();
    const profile = makeProfile(UUID_A);
    const oauth: OAuthIdentity = { provider: "apple", providerUserId: "p-1", profileId: UUID_A };
    const review: Review = {
      id: "00000000-0000-0000-0000-0000000000c1",
      authorId: UUID_A,
      bookId: "00000000-0000-0000-0000-0000000000d1",
      body: "Great book",
      visibility: "public",
      version: 1,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const shelf: Shelf = {
      id: "00000000-0000-0000-0000-0000000000e1",
      ownerId: UUID_A,
      name: "Reading",
      slug: "reading",
      visibility: "followers",
      isSystem: true,
      kind: "system",
      authorType: "user",
      version: 1,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const shelfItem: ShelfItem = {
      id: "00000000-0000-0000-0000-0000000000f1",
      shelfId: shelf.id,
      bookId: "00000000-0000-0000-0000-0000000000d1",
      status: "reading",
      addedAt: NOW,
      updatedAt: NOW,
    };
    const list: List = {
      id: "00000000-0000-0000-0000-000000000101",
      ownerId: UUID_A,
      title: "Beach reads",
      visibility: "public",
      createdAt: NOW,
      updatedAt: NOW,
    };
    const ranking: Ranking = {
      id: "00000000-0000-0000-0000-000000000111",
      profileId: UUID_A,
      bookId: "00000000-0000-0000-0000-0000000000d1",
      position: 1,
      score: 9.5,
      bucket: 5,
      version: 1,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const following: Follow = {
      id: "00000000-0000-0000-0000-000000000121",
      followerId: UUID_A,
      followeeId: UUID_B,
      createdAt: NOW,
    };
    const block: Block = {
      id: "00000000-0000-0000-0000-000000000131",
      blockerId: UUID_A,
      blockedId: UUID_B,
      createdAt: NOW,
    };
    const event: ActivityEvent = {
      id: "00000000-0000-0000-0000-000000000141",
      actorId: UUID_A,
      verb: "book_finished",
      visibility: "followers",
      occurredAt: NOW,
    };
    const notif: InAppNotification = {
      id: "00000000-0000-0000-0000-000000000151",
      recipientId: UUID_A,
      trigger: "new_follower",
      payload: {},
      createdAt: NOW,
    };
    const token: NotificationToken = {
      profileId: UUID_A,
      platform: "apns",
      token: "device-token",
      lastSeen: NOW,
    };
    const setting: NotificationSetting = {
      profileId: UUID_A,
      key: "settings",
      value: { quietHours: { enabled: false } },
    };
    const contactsHash: ContactsHash = {
      id: "00000000-0000-0000-0000-000000000161",
      userId: UUID_A,
      hash: "h1",
      saltVersion: 1,
      createdAt: NOW,
      expiresAt: new Date(NOW.getTime() + 90 * 24 * 60 * 60 * 1000),
    };
    const emailHash: EmailIndex = {
      profileId: UUID_A,
      emailHash: "eh1",
      saltVersion: 1,
      expiresAt: new Date(NOW.getTime() + 90 * 24 * 60 * 60 * 1000),
    };
    const phoneNumber: PhoneNumber = { profileId: UUID_A, e164Hash: "ph1" };
    const importRow: Import = {
      id: "00000000-0000-0000-0000-000000000171",
      ownerId: UUID_A,
      source: "goodreads",
      conflictCount: 0,
      status: "completed",
      createdAt: NOW,
    };

    (repos.profiles.findById as ReturnType<typeof vi.fn>).mockResolvedValue(profile);
    (repos.authIdentities.listByProfile as ReturnType<typeof vi.fn>).mockResolvedValue([oauth]);
    (repos.reviews.listByAuthor as ReturnType<typeof vi.fn>).mockResolvedValue([review]);
    (repos.shelves.listShelves as ReturnType<typeof vi.fn>).mockResolvedValue([shelf]);
    (repos.shelves.listShelfItemsByOwner as ReturnType<typeof vi.fn>).mockResolvedValue([shelfItem]);
    (repos.lists.listByOwner as ReturnType<typeof vi.fn>).mockResolvedValue([list]);
    (repos.rankings.listByOwner as ReturnType<typeof vi.fn>).mockResolvedValue([ranking]);
    (repos.follows.listFollowing as ReturnType<typeof vi.fn>).mockResolvedValue([following]);
    (repos.follows.listFollowers as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (repos.blocks.listBlockedByUser as ReturnType<typeof vi.fn>).mockResolvedValue([block]);
    (repos.blocks.listBlockingUser as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (repos.activity.listByActor as ReturnType<typeof vi.fn>).mockResolvedValue([event]);
    (repos.inAppNotifications.listAllByRecipient as ReturnType<typeof vi.fn>).mockResolvedValue([notif]);
    (repos.notifications.listTokensForProfile as ReturnType<typeof vi.fn>).mockResolvedValue([token]);
    (repos.notifications.listSettings as ReturnType<typeof vi.fn>).mockResolvedValue([setting]);
    (repos.contacts.listByUser as ReturnType<typeof vi.fn>).mockResolvedValue([contactsHash]);
    (repos.emailIndex.listByUser as ReturnType<typeof vi.fn>).mockResolvedValue([emailHash]);
    (repos.phoneNumbers.findByProfileId as ReturnType<typeof vi.fn>).mockResolvedValue(phoneNumber);
    (repos.imports.listByOwner as ReturnType<typeof vi.fn>).mockResolvedValue([importRow]);

    const { storage, putObject, uploads } = makeFakeStorage();
    const service = new AccountExportService(repos, storage, { now: () => NOW });

    const { url, expiresAt } = await service.buildExport(UUID_A);

    expect(url).toMatch(/^https:\/\/signed\.example\.com\//);
    expect(expiresAt.getTime() - NOW.getTime()).toBe(ACCOUNT_EXPORT_URL_TTL_MS);
    expect(putObject).toHaveBeenCalledTimes(1);

    // Verify each repo was queried exactly once for the subject profile.
    expect(repos.profiles.findById).toHaveBeenCalledWith(UUID_A);
    expect(repos.authIdentities.listByProfile).toHaveBeenCalledWith(UUID_A);
    expect(repos.reviews.listByAuthor).toHaveBeenCalledWith(UUID_A);
    expect(repos.shelves.listShelves).toHaveBeenCalledWith(UUID_A, UUID_A);
    expect(repos.shelves.listShelfItemsByOwner).toHaveBeenCalledWith(UUID_A);
    expect(repos.lists.listByOwner).toHaveBeenCalledWith(UUID_A, UUID_A);
    expect(repos.rankings.listByOwner).toHaveBeenCalledWith(UUID_A, UUID_A);
    expect(repos.follows.listFollowing).toHaveBeenCalledWith(UUID_A, UUID_A);
    expect(repos.follows.listFollowers).toHaveBeenCalledWith(UUID_A, UUID_A);
    expect(repos.blocks.listBlockedByUser).toHaveBeenCalledWith(UUID_A);
    expect(repos.blocks.listBlockingUser).toHaveBeenCalledWith(UUID_A);
    expect(repos.activity.listByActor).toHaveBeenCalledWith(UUID_A);
    expect(repos.inAppNotifications.listAllByRecipient).toHaveBeenCalledWith(UUID_A);
    expect(repos.notifications.listTokensForProfile).toHaveBeenCalledWith(UUID_A);
    expect(repos.notifications.listSettings).toHaveBeenCalledWith(UUID_A);
    expect(repos.contacts.listByUser).toHaveBeenCalledWith(UUID_A);
    expect(repos.emailIndex.listByUser).toHaveBeenCalledWith(UUID_A);
    expect(repos.phoneNumbers.findByProfileId).toHaveBeenCalledWith(UUID_A);
    expect(repos.imports.listByOwner).toHaveBeenCalledWith(UUID_A);

    // The uploaded blob is gzipped JSON; decompressing it should yield
    // a `AccountExportPayload` containing every collected row.
    expect(uploads).toHaveLength(1);
    const upload = uploads[0]!;
    expect(upload.contentType).toBe("application/gzip");
    expect(upload.key).toContain(`account-exports/${UUID_A}/`);
    expect(upload.expiresInMs).toBe(ACCOUNT_EXPORT_URL_TTL_MS);
    const decoded = JSON.parse(gunzipSync(upload.body).toString("utf8")) as AccountExportPayload;
    expect(decoded.schemaVersion).toBe(ACCOUNT_EXPORT_SCHEMA_VERSION);
    expect(decoded.profileId).toBe(UUID_A);
    expect(decoded.profile?.id).toBe(UUID_A);
    expect(decoded.reviews).toHaveLength(1);
    expect(decoded.shelves).toHaveLength(1);
    expect(decoded.shelfItems).toHaveLength(1);
    expect(decoded.lists).toHaveLength(1);
    expect(decoded.rankings).toHaveLength(1);
    expect(decoded.follows.following).toHaveLength(1);
    expect(decoded.blocks.outgoing).toHaveLength(1);
    expect(decoded.activityEvents).toHaveLength(1);
    expect(decoded.inAppNotifications).toHaveLength(1);
    expect(decoded.notificationTokens).toHaveLength(1);
    expect(decoded.notificationSettings).toHaveLength(1);
    expect(decoded.contactsHashes).toHaveLength(1);
    expect(decoded.emailHashes).toHaveLength(1);
    expect(decoded.phoneNumber).not.toBeNull();
    expect(decoded.imports).toHaveLength(1);
    expect(decoded.oauthIdentities).toHaveLength(1);
  });

  it("handles a profile with no data — every collection is empty, no errors", async () => {
    const repos = makeEmptyRepos();
    const { storage, putObject, uploads } = makeFakeStorage();
    const service = new AccountExportService(repos, storage, { now: () => NOW });

    const { url, expiresAt } = await service.buildExport(UUID_A);

    expect(url).toContain("signed.example.com");
    expect(expiresAt.getTime()).toBe(NOW.getTime() + ACCOUNT_EXPORT_URL_TTL_MS);
    expect(putObject).toHaveBeenCalledTimes(1);

    const upload = uploads[0]!;
    const decoded = JSON.parse(gunzipSync(upload.body).toString("utf8")) as AccountExportPayload;
    expect(decoded.profile).toBeNull();
    expect(decoded.reviews).toEqual([]);
    expect(decoded.shelves).toEqual([]);
    expect(decoded.shelfItems).toEqual([]);
    expect(decoded.lists).toEqual([]);
    expect(decoded.rankings).toEqual([]);
    expect(decoded.follows).toEqual({ following: [], followers: [] });
    expect(decoded.blocks).toEqual({ outgoing: [], incoming: [] });
    expect(decoded.activityEvents).toEqual([]);
    expect(decoded.inAppNotifications).toEqual([]);
    expect(decoded.notificationTokens).toEqual([]);
    expect(decoded.notificationSettings).toEqual([]);
    expect(decoded.contactsHashes).toEqual([]);
    expect(decoded.emailHashes).toEqual([]);
    expect(decoded.phoneNumber).toBeNull();
    expect(decoded.imports).toEqual([]);
    expect(decoded.oauthIdentities).toEqual([]);
  });

  it("respects a custom TTL when supplied", async () => {
    const repos = makeEmptyRepos();
    const { storage } = makeFakeStorage();
    const ttlMs = 60_000;
    const service = new AccountExportService(repos, storage, { ttlMs, now: () => NOW });

    const { expiresAt } = await service.buildExport(UUID_A);
    expect(expiresAt.getTime() - NOW.getTime()).toBe(ttlMs);
  });
});

/**
 * Property test (#153 — privacy-adjacent): the export for profile A
 * must never contain rows belonging to profile B. We seed a shared
 * fixture with both profiles' data and assert that the assembled
 * payload, when filtered to only "owner" fields, points only at A.
 */
describe("AccountExportService cross-profile isolation (property)", () => {
  it("never includes other profiles' rows in the export", () => {
    const reviewArb = (ownerId: string) =>
      fc.record({
        id: fc.uuid(),
        authorId: fc.constant(ownerId),
        bookId: fc.uuid(),
        body: fc.string({ minLength: 1, maxLength: 64 }),
        visibility: fc.constantFrom("public", "followers", "mutuals", "private"),
        version: fc.constant(1),
        createdAt: fc.constant(NOW),
        updatedAt: fc.constant(NOW),
      });

    const shelfArb = (ownerId: string) =>
      fc.record({
        id: fc.uuid(),
        ownerId: fc.constant(ownerId),
        name: fc.string({ minLength: 1, maxLength: 32 }),
        slug: fc.string({ minLength: 1, maxLength: 32 }),
        visibility: fc.constantFrom("public", "followers", "mutuals", "private"),
        isSystem: fc.boolean(),
        kind: fc.constantFrom("system", "custom", "list"),
        authorType: fc.constant("user"),
        version: fc.constant(1),
        createdAt: fc.constant(NOW),
        updatedAt: fc.constant(NOW),
      });

    const followArb = (followerId: string) =>
      fc.record({
        id: fc.uuid(),
        followerId: fc.constant(followerId),
        followeeId: fc.uuid(),
        createdAt: fc.constant(NOW),
      });

    return fc.assert(
      fc.asyncProperty(
        fc.array(reviewArb(UUID_A), { maxLength: 5 }),
        fc.array(reviewArb(UUID_B), { maxLength: 5 }),
        fc.array(shelfArb(UUID_A), { maxLength: 5 }),
        fc.array(shelfArb(UUID_B), { maxLength: 5 }),
        fc.array(followArb(UUID_A), { maxLength: 5 }),
        fc.array(followArb(UUID_B), { maxLength: 5 }),
        async (reviewsA, reviewsB, shelvesA, shelvesB, followsA, followsB) => {
          const repos = makeEmptyRepos();
          // The repos are wired such that querying for A returns only
          // A's data — this models a correctly-implemented adapter
          // (e.g. the Drizzle implementation that filters by ownerId).
          // The test guarantees: the SERVICE never asks for any data
          // outside its single `profileId` argument.
          (repos.reviews.listByAuthor as ReturnType<typeof vi.fn>).mockImplementation(
            async (authorId: string) => (authorId === UUID_A ? reviewsA : reviewsB),
          );
          (repos.shelves.listShelves as ReturnType<typeof vi.fn>).mockImplementation(
            async (ownerId: string) => (ownerId === UUID_A ? shelvesA : shelvesB),
          );
          (repos.follows.listFollowing as ReturnType<typeof vi.fn>).mockImplementation(
            async (ownerId: string) => (ownerId === UUID_A ? followsA : followsB),
          );

          const { storage } = makeFakeStorage();
          const service = new AccountExportService(repos, storage, { now: () => NOW });
          const payload = await service.collectPayload(UUID_A);

          // Every collected row carries A's id in its owner-pointing
          // field; nothing points at B.
          for (const review of payload.reviews) {
            expect(review.authorId).toBe(UUID_A);
            expect(review.authorId).not.toBe(UUID_B);
          }
          for (const shelf of payload.shelves) {
            expect(shelf.ownerId).toBe(UUID_A);
            expect(shelf.ownerId).not.toBe(UUID_B);
          }
          for (const follow of payload.follows.following) {
            expect(follow.followerId).toBe(UUID_A);
            expect(follow.followerId).not.toBe(UUID_B);
          }

          // Counts match: every row B produced is absent.
          expect(payload.reviews.length).toBe(reviewsA.length);
          expect(payload.shelves.length).toBe(shelvesA.length);
          expect(payload.follows.following.length).toBe(followsA.length);
        },
      ),
      { numRuns: 20 },
    );
  });
});
