import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { trpcServer } from "@hono/trpc-server";
import type { AppRepositories, AuthIdentity, Profile } from "@hone/domain";
import { POSTURE_C_DEFAULTS } from "@hone/domain";
import { createTrpcContext } from "./context";
import { router } from "./trpc";
import { discoverRouter } from "./discover";

vi.mock("@hone/observability", () => ({
  captureException: vi.fn(),
  createLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn() })),
  initSentry: vi.fn(),
  setSentryUser: vi.fn(),
  clearSentryUser: vi.fn(),
}));

const VIEWER = "00000000-0000-0000-0000-000000000001";
const PROFILE_A = "00000000-0000-0000-0000-0000000000aa";
const PROFILE_B = "00000000-0000-0000-0000-0000000000bb";

function makeProfile(id: string, overrides?: Partial<Profile>): Profile {
  const now = new Date("2026-05-01");
  return {
    id,
    handle: `user-${id.slice(-4)}`,
    displayName: `User ${id.slice(-4)}`,
    verified: false,
    defaultVisibility: POSTURE_C_DEFAULTS,
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeRepositories(overrides?: Partial<AppRepositories>): AppRepositories {
  return {
    accountDeletions: { create: vi.fn(), findByProfileId: vi.fn().mockResolvedValue(null), delete: vi.fn(), listExpired: vi.fn().mockResolvedValue([]), purgeProfile: vi.fn() },
    deletedProfileTombstones: { create: vi.fn(), findByHandle: vi.fn().mockResolvedValue(null), purgeExpired: vi.fn().mockResolvedValue(0) },
    profiles: { findById: vi.fn().mockResolvedValue(null), findByHandle: vi.fn(), create: vi.fn(), isHandleTaken: vi.fn(), setHandle: vi.fn() },
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
    follows: {
      follow: vi.fn(),
      unfollow: vi.fn(),
      findFollow: vi.fn().mockResolvedValue(null),
      listFollowers: vi.fn().mockResolvedValue([]),
      listFollowing: vi.fn().mockResolvedValue([]),
      isMutual: vi.fn().mockResolvedValue(false),
      countMutuals: vi.fn().mockResolvedValue(0),
      listMutualIds: vi.fn().mockResolvedValue([]),
      listFriendsOfFriends: vi.fn().mockResolvedValue([]),
    },
    blocks: { block: vi.fn(), unblock: vi.fn(), findBlock: vi.fn(), listBlockedByUser: vi.fn().mockResolvedValue([]), listBlockingUser: vi.fn().mockResolvedValue([]), isBlocked: vi.fn(), migrateBlocksAgainstToHash: vi.fn().mockResolvedValue(0), findAgainstHashEntries: vi.fn().mockResolvedValue([]), createMany: vi.fn().mockResolvedValue(0) },
    rankings: { upsert: vi.fn(), findById: vi.fn(), findByOwnerAndBook: vi.fn(), listByOwner: vi.fn(), delete: vi.fn(), startBucket: vi.fn() },
    notifications: { registerToken: vi.fn(), removeToken: vi.fn(), listTokensForProfile: vi.fn(), getSetting: vi.fn(), setSetting: vi.fn(), listSettings: vi.fn() },
    imports: { create: vi.fn(), findById: vi.fn(), findByOwnerAndHash: vi.fn(), listByOwner: vi.fn(), updateStatus: vi.fn() },
    contacts: { upsertHashes: vi.fn(), findMatches: vi.fn(), findMatchingProfilesByPhone: vi.fn().mockResolvedValue([]), deleteForUser: vi.fn(), deleteExpired: vi.fn(), listByUser: vi.fn(), expireBySaltVersion: vi.fn(), deleteByTargetHash: vi.fn(), softDisable: vi.fn(), purgeOlderThan: vi.fn().mockResolvedValue(0) },
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

function buildApp(identity: AuthIdentity | null, repositories: AppRepositories) {
  const testRouter = router({ discover: discoverRouter });
  const app = new Hono();
  const auth = { getCurrentIdentity: async () => identity };
  app.use(
    "/trpc/*",
    trpcServer({
      router: testRouter,
      createContext: createTrpcContext({ repositories, auth }),
    }),
  );
  return app;
}

describe("discover.peopleYouMayKnow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    const repos = makeRepositories();
    const app = buildApp(null, repos);
    const res = await app.request(
      `/trpc/discover.peopleYouMayKnow?input=${encodeURIComponent(JSON.stringify({ limit: 20 }))}`,
    );
    expect(res.status).toBe(401);
  });

  it("returns combined contacts-match + FoF suggestions for the authenticated viewer", async () => {
    const profileA = makeProfile(PROFILE_A);
    const profileB = makeProfile(PROFILE_B);
    const profilesById = new Map<string, Profile>([
      [PROFILE_A, profileA],
      [PROFILE_B, profileB],
    ]);
    const repos = makeRepositories({
      profiles: {
        findById: vi.fn(async (id: string) => profilesById.get(id) ?? null),
        findByHandle: vi.fn(),
        create: vi.fn(),
        isHandleTaken: vi.fn(),
        setHandle: vi.fn(),
      },
      contacts: {
        upsertHashes: vi.fn(),
        findMatches: vi.fn(),
        findMatchingProfilesByPhone: vi.fn().mockResolvedValue([PROFILE_A]),
        deleteForUser: vi.fn(),
        deleteExpired: vi.fn(),
        listByUser: vi.fn(),
        expireBySaltVersion: vi.fn(),
        deleteByTargetHash: vi.fn(),
        softDisable: vi.fn(),
        purgeOlderThan: vi.fn().mockResolvedValue(0),
      },
      follows: {
        follow: vi.fn(),
        unfollow: vi.fn(),
        findFollow: vi.fn().mockResolvedValue(null),
        listFollowers: vi.fn().mockResolvedValue([]),
        listFollowing: vi.fn().mockResolvedValue([]),
        isMutual: vi.fn().mockResolvedValue(false),
        countMutuals: vi.fn().mockResolvedValue(0),
        listMutualIds: vi.fn().mockResolvedValue([]),
        listFriendsOfFriends: vi.fn().mockResolvedValue([{ profileId: PROFILE_B, count: 3 }]),
      },
    });
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request(
      `/trpc/discover.peopleYouMayKnow?input=${encodeURIComponent(JSON.stringify({ limit: 20 }))}`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const list = body.result.data.suggestions as Array<{
      profileId: string;
      source: string;
    }>;
    expect(list).toHaveLength(2);
    const ids = list.map((r) => r.profileId).sort();
    expect(ids).toEqual([PROFILE_A, PROFILE_B].sort());
    const a = list.find((r) => r.profileId === PROFILE_A);
    const b = list.find((r) => r.profileId === PROFILE_B);
    expect(a?.source).toBe("contacts");
    expect(b?.source).toBe("fof");
  });

  it("uses the default limit (20) when no limit is supplied", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request(
      `/trpc/discover.peopleYouMayKnow?input=${encodeURIComponent(JSON.stringify({}))}`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.suggestions).toEqual([]);
  });

  it("excludes mutuals from the suggestions", async () => {
    const profileA = makeProfile(PROFILE_A);
    const profilesById = new Map<string, Profile>([[PROFILE_A, profileA]]);
    const repos = makeRepositories({
      profiles: {
        findById: vi.fn(async (id: string) => profilesById.get(id) ?? null),
        findByHandle: vi.fn(),
        create: vi.fn(),
        isHandleTaken: vi.fn(),
        setHandle: vi.fn(),
      },
      contacts: {
        upsertHashes: vi.fn(),
        findMatches: vi.fn(),
        findMatchingProfilesByPhone: vi.fn().mockResolvedValue([PROFILE_A]),
        deleteForUser: vi.fn(),
        deleteExpired: vi.fn(),
        listByUser: vi.fn(),
        expireBySaltVersion: vi.fn(),
        deleteByTargetHash: vi.fn(),
        softDisable: vi.fn(),
        purgeOlderThan: vi.fn().mockResolvedValue(0),
      },
      follows: {
        follow: vi.fn(),
        unfollow: vi.fn(),
        findFollow: vi.fn().mockResolvedValue(null),
        listFollowers: vi.fn().mockResolvedValue([]),
        listFollowing: vi.fn().mockResolvedValue([]),
        isMutual: vi.fn().mockResolvedValue(false),
        countMutuals: vi.fn().mockResolvedValue(0),
        // PROFILE_A is already mutual with the viewer → must not be in suggestions.
        listMutualIds: vi.fn().mockResolvedValue([PROFILE_A]),
        listFriendsOfFriends: vi.fn().mockResolvedValue([]),
      },
    });
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request(
      `/trpc/discover.peopleYouMayKnow?input=${encodeURIComponent(JSON.stringify({ limit: 20 }))}`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.suggestions).toEqual([]);
  });
});
