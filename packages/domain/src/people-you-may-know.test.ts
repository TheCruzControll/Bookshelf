import { describe, it, expect, vi } from "vitest";
import { SocialService, POSTURE_C_DEFAULTS } from "./services";
import type {
  ActivityRepository,
  BlockRepository,
  ContactsRepository,
  FollowRepository,
  ListRepository,
  ProfileRepository,
  RecommendationRepository,
} from "./ports";
import type { Block, Profile, Visibility } from "./types";

const VIEWER = "00000000-0000-0000-0000-000000000001";
const PROFILE_A = "00000000-0000-0000-0000-0000000000aa";
const PROFILE_B = "00000000-0000-0000-0000-0000000000bb";
const PROFILE_C = "00000000-0000-0000-0000-0000000000cc";
const PROFILE_X = "00000000-0000-0000-0000-0000000000dd";

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

function makeBlock(blockerId: string, blockedId: string): Block {
  return { id: `block-${blockerId}-${blockedId}`, blockerId, blockedId, createdAt: new Date() };
}

function makeFollowRepo(overrides?: Partial<FollowRepository>): FollowRepository {
  return {
    follow: vi.fn(),
    unfollow: vi.fn(),
    findFollow: vi.fn().mockResolvedValue(null),
    listFollowers: vi.fn().mockResolvedValue([]),
    listFollowing: vi.fn().mockResolvedValue([]),
    isMutual: vi.fn().mockResolvedValue(false),
    countMutuals: vi.fn().mockResolvedValue(0),
    listMutualIds: vi.fn().mockResolvedValue([]),
    listFriendsOfFriends: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function makeBlockRepo(outgoing: Block[] = [], incoming: Block[] = []): BlockRepository {
  return {
    block: vi.fn(),
    unblock: vi.fn(),
    findBlock: vi.fn(),
    listBlockedByUser: vi.fn().mockResolvedValue(outgoing),
    listBlockingUser: vi.fn().mockResolvedValue(incoming),
    isBlocked: vi.fn().mockResolvedValue(false),
    migrateBlocksAgainstToHash: vi.fn().mockResolvedValue(0),
    findAgainstHashEntries: vi.fn().mockResolvedValue([]),
    createMany: vi.fn().mockResolvedValue(0),
  };
}

function makeContactsRepo(matches: string[] = []): ContactsRepository {
  return {
    upsertHashes: vi.fn(),
    findMatches: vi.fn().mockResolvedValue([]),
    findMatchingProfilesByPhone: vi.fn().mockResolvedValue(matches),
    deleteForUser: vi.fn(),
    deleteExpired: vi.fn(),
    expireBySaltVersion: vi.fn(),
    deleteByTargetHash: vi.fn(),
    listByUser: vi.fn(),
    softDisable: vi.fn(),
    purgeOlderThan: vi.fn().mockResolvedValue(0),
  };
}

function makeProfilesRepo(byId: Map<string, Profile>): ProfileRepository {
  return {
    findById: vi.fn(async (id: string) => byId.get(id) ?? null),
    findByHandle: vi.fn(),
    create: vi.fn(),
    isHandleTaken: vi.fn(),
    setHandle: vi.fn(),
  };
}

function makeRecsRepo(): RecommendationRepository {
  return { getForUser: vi.fn().mockResolvedValue([]) };
}

function makeActivityRepo(): ActivityRepository {
  return {
    append: vi.fn(),
    getFriendFeed: vi.fn().mockResolvedValue([]),
    getFriendFeedGrouped: vi.fn().mockResolvedValue([]),
    deleteByReviewId: vi.fn(),
    listByActor: vi.fn().mockResolvedValue([]),
  };
}

function makeListsRepo(): ListRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    listByOwner: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
    delete: vi.fn(),
    addItem: vi.fn(),
    removeItem: vi.fn(),
    listItems: vi.fn(),
    reorderItems: vi.fn(),
  };
}

function makeService(opts: {
  contactsMatches?: string[];
  fof?: Array<{ profileId: string; count: number }>;
  mutualIds?: string[];
  outgoingBlocks?: Block[];
  incomingBlocks?: Block[];
  profiles?: Map<string, Profile>;
  viewerFollows?: Set<string>;
  countMutuals?: Map<string, number>;
}) {
  const followRepo = makeFollowRepo({
    listFriendsOfFriends: vi.fn().mockResolvedValue(opts.fof ?? []),
    listMutualIds: vi.fn().mockResolvedValue(opts.mutualIds ?? []),
    findFollow: vi.fn(async (input: { followerId: string; followeeId: string }) => {
      if (input.followerId !== VIEWER) return null;
      return opts.viewerFollows?.has(input.followeeId)
        ? { id: "f", followerId: input.followerId, followeeId: input.followeeId, createdAt: new Date() }
        : null;
    }),
    countMutuals: vi.fn(async (id: string) => opts.countMutuals?.get(id) ?? 0),
  });
  const contactsRepo = makeContactsRepo(opts.contactsMatches ?? []);
  const blockRepo = makeBlockRepo(opts.outgoingBlocks ?? [], opts.incomingBlocks ?? []);
  const profilesRepo = makeProfilesRepo(opts.profiles ?? new Map());
  return new SocialService(
    followRepo,
    blockRepo,
    contactsRepo,
    makeRecsRepo(),
    makeActivityRepo(),
    profilesRepo,
    makeListsRepo(),
  );
}

describe("SocialService.getPeopleYouMayKnow", () => {
  it("surfaces contacts-match candidates when the viewer has no follows", async () => {
    const profiles = new Map<string, Profile>([
      [PROFILE_A, makeProfile(PROFILE_A)],
      [PROFILE_B, makeProfile(PROFILE_B)],
    ]);
    const service = makeService({
      contactsMatches: [PROFILE_A, PROFILE_B],
      fof: [],
      profiles,
    });
    const result = await service.getPeopleYouMayKnow({ viewerId: VIEWER, limit: 20 });
    expect(result).toHaveLength(2);
    const ids = result.map((r) => r.profileId).sort();
    expect(ids).toEqual([PROFILE_A, PROFILE_B].sort());
    for (const item of result) {
      expect(item.source).toBe("contacts");
    }
  });

  it("ranks FoF candidates with high shared-friend count higher", async () => {
    const profiles = new Map<string, Profile>([
      [PROFILE_X, makeProfile(PROFILE_X)],
      [PROFILE_C, makeProfile(PROFILE_C)],
    ]);
    // PROFILE_X is followed by 5 of the viewer's friends; PROFILE_C only 1.
    // Same mutualCount (both 0) so the FoF count breaks the tie.
    const service = makeService({
      fof: [
        { profileId: PROFILE_X, count: 5 },
        { profileId: PROFILE_C, count: 1 },
      ],
      profiles,
    });
    const result = await service.getPeopleYouMayKnow({ viewerId: VIEWER, limit: 20 });
    expect(result).toHaveLength(2);
    expect(result[0]?.profileId).toBe(PROFILE_X);
    expect(result[0]?.source).toBe("fof");
    expect(result[1]?.profileId).toBe(PROFILE_C);
  });

  it("excludes profiles blocked by the viewer", async () => {
    const profiles = new Map<string, Profile>([
      [PROFILE_A, makeProfile(PROFILE_A)],
      [PROFILE_B, makeProfile(PROFILE_B)],
    ]);
    const service = makeService({
      contactsMatches: [PROFILE_A, PROFILE_B],
      outgoingBlocks: [makeBlock(VIEWER, PROFILE_B)],
      profiles,
    });
    const result = await service.getPeopleYouMayKnow({ viewerId: VIEWER, limit: 20 });
    expect(result.map((r) => r.profileId)).toEqual([PROFILE_A]);
  });

  it("excludes profiles that blocked the viewer", async () => {
    const profiles = new Map<string, Profile>([
      [PROFILE_A, makeProfile(PROFILE_A)],
      [PROFILE_B, makeProfile(PROFILE_B)],
    ]);
    const service = makeService({
      contactsMatches: [PROFILE_A, PROFILE_B],
      incomingBlocks: [makeBlock(PROFILE_B, VIEWER)],
      profiles,
    });
    const result = await service.getPeopleYouMayKnow({ viewerId: VIEWER, limit: 20 });
    expect(result.map((r) => r.profileId)).toEqual([PROFILE_A]);
  });

  it("excludes mutuals of the viewer", async () => {
    const profiles = new Map<string, Profile>([
      [PROFILE_A, makeProfile(PROFILE_A)],
      [PROFILE_B, makeProfile(PROFILE_B)],
    ]);
    const service = makeService({
      contactsMatches: [PROFILE_A, PROFILE_B],
      mutualIds: [PROFILE_B],
      profiles,
    });
    const result = await service.getPeopleYouMayKnow({ viewerId: VIEWER, limit: 20 });
    expect(result.map((r) => r.profileId)).toEqual([PROFILE_A]);
  });

  it("excludes the viewer themselves even if surfaced as a candidate", async () => {
    const profiles = new Map<string, Profile>([
      [VIEWER, makeProfile(VIEWER)],
      [PROFILE_A, makeProfile(PROFILE_A)],
    ]);
    // A buggy upstream might leak the viewer's own id; the service must drop it.
    const service = makeService({
      contactsMatches: [VIEWER, PROFILE_A],
      fof: [{ profileId: VIEWER, count: 99 }],
      profiles,
    });
    const result = await service.getPeopleYouMayKnow({ viewerId: VIEWER, limit: 20 });
    expect(result.map((r) => r.profileId)).toEqual([PROFILE_A]);
  });

  it("tags candidates surfaced by both contacts and FoF with source 'both'", async () => {
    const profiles = new Map<string, Profile>([[PROFILE_A, makeProfile(PROFILE_A)]]);
    const service = makeService({
      contactsMatches: [PROFILE_A],
      fof: [{ profileId: PROFILE_A, count: 3 }],
      profiles,
    });
    const result = await service.getPeopleYouMayKnow({ viewerId: VIEWER, limit: 20 });
    expect(result).toHaveLength(1);
    expect(result[0]?.source).toBe("both");
  });

  it("drops candidates whose profile is soft-deleted (findById returns null)", async () => {
    // PROFILE_B has no entry in the profiles map -> simulates a soft-deleted row.
    const profiles = new Map<string, Profile>([[PROFILE_A, makeProfile(PROFILE_A)]]);
    const service = makeService({
      contactsMatches: [PROFILE_A, PROFILE_B],
      profiles,
    });
    const result = await service.getPeopleYouMayKnow({ viewerId: VIEWER, limit: 20 });
    expect(result.map((r) => r.profileId)).toEqual([PROFILE_A]);
  });

  it("filters profiles whose identity visibility is private from non-followers", async () => {
    // PROFILE_A is a strict-privacy user: identity == "private". The viewer is
    // not a follower, so identity-visibility filter must drop them.
    const lockedDefaults = { ...POSTURE_C_DEFAULTS, identity: "private" as Visibility };
    const profiles = new Map<string, Profile>([
      [PROFILE_A, makeProfile(PROFILE_A, { defaultVisibility: lockedDefaults })],
      [PROFILE_B, makeProfile(PROFILE_B)],
    ]);
    const service = makeService({
      contactsMatches: [PROFILE_A, PROFILE_B],
      profiles,
    });
    const result = await service.getPeopleYouMayKnow({ viewerId: VIEWER, limit: 20 });
    expect(result.map((r) => r.profileId)).toEqual([PROFILE_B]);
  });

  it("returns an empty list when there are no candidates from either source", async () => {
    const service = makeService({});
    const result = await service.getPeopleYouMayKnow({ viewerId: VIEWER, limit: 20 });
    expect(result).toEqual([]);
  });

  it("ranks by mutualCount desc, breaking ties by FoF count", async () => {
    const profiles = new Map<string, Profile>([
      [PROFILE_A, makeProfile(PROFILE_A)],
      [PROFILE_B, makeProfile(PROFILE_B)],
      [PROFILE_C, makeProfile(PROFILE_C)],
    ]);
    const service = makeService({
      contactsMatches: [PROFILE_A],
      fof: [
        { profileId: PROFILE_B, count: 2 },
        { profileId: PROFILE_C, count: 4 },
      ],
      profiles,
      // A has highest mutual count -> first.
      // B and C tied (mutualCount=0) but C has higher fofCount -> C before B.
      countMutuals: new Map([
        [PROFILE_A, 10],
        [PROFILE_B, 0],
        [PROFILE_C, 0],
      ]),
    });
    const result = await service.getPeopleYouMayKnow({ viewerId: VIEWER, limit: 20 });
    expect(result.map((r) => r.profileId)).toEqual([PROFILE_A, PROFILE_C, PROFILE_B]);
  });

  it("respects the limit parameter", async () => {
    const profiles = new Map<string, Profile>([
      [PROFILE_A, makeProfile(PROFILE_A)],
      [PROFILE_B, makeProfile(PROFILE_B)],
      [PROFILE_C, makeProfile(PROFILE_C)],
    ]);
    const service = makeService({
      contactsMatches: [PROFILE_A, PROFILE_B, PROFILE_C],
      profiles,
    });
    const result = await service.getPeopleYouMayKnow({ viewerId: VIEWER, limit: 2 });
    expect(result).toHaveLength(2);
  });
});
