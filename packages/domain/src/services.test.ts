import { describe, it, expect, vi } from "vitest";
import * as fc from "fast-check";
import { subtle } from "node:crypto";
import { ShelfService, HandleService, AppServices, ProfileService, RankingService, AuthService, ReviewService, BlockService, SocialService, FollowService, SYSTEM_SHELVES, POSTURE_C_DEFAULTS, slugify } from "./services";
import type { ActivityRepository, AppRepositories, AuthProvider, BlockRepository, ContactsRepository, FollowRepository, ListRepository, ProfileRepository, RankingRepository, AuthIdentityRepository, RecommendationRepository, SessionRepository, AppleJwksProvider, AppleJwk, GoogleJwksProvider, GoogleJwk, ReviewRepository, ShelfRepository } from "./ports";
import type { Block, FeedItem, Follow, List, Profile, Ranking, Recommendation, Review, Shelf, ShelfItem } from "./types";

function makeShelfItem(overrides?: Partial<ShelfItem>): ShelfItem {
  const now = new Date();
  return {
    id: "00000000-0000-0000-0000-000000000010",
    shelfId: "00000000-0000-0000-0000-000000000011",
    bookId: "00000000-0000-0000-0000-000000000012",
    status: "finished",
    addedAt: now,
    updatedAt: now,
    ...overrides
  };
}

function makeProfile(overrides?: Partial<Profile>): Profile {
  const now = new Date();
  return {
    id: "00000000-0000-0000-0000-000000000001",
    handle: "testuser",
    displayName: "Test User",
    defaultVisibility: POSTURE_C_DEFAULTS,
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides
  } as Profile;
}

function makeShelf(overrides?: Partial<Shelf>): Shelf {
  const now = new Date();
  return {
    id: "00000000-0000-0000-0000-000000000020",
    ownerId: "00000000-0000-0000-0000-000000000001",
    name: "Reading",
    slug: "reading",
    visibility: "followers",
    isSystem: true,
    kind: "system",
    authorType: "user",
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides
  } as Shelf;
}

describe("ShelfService", () => {
  it("addBookToShelf delegates to shelves.addBook and appends an activity event", async () => {
    const shelfItem = makeShelfItem();
    const shelves: ShelfRepository = {
      listShelves: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      addBook: vi.fn().mockResolvedValue(shelfItem),
      rankShelfItem: vi.fn(),
      createSystemShelves: vi.fn()
    };
    const activity: ActivityRepository = {
      append: vi.fn().mockResolvedValue({ id: "evt-1", actorId: "u1", verb: "book_added", visibility: "followers", occurredAt: new Date() }),
      getFriendFeed: vi.fn()
    };

    const service = new ShelfService(shelves, activity);
    const input = {
      ownerId: "00000000-0000-0000-0000-000000000001",
      shelfId: "00000000-0000-0000-0000-000000000011",
      bookId: "00000000-0000-0000-0000-000000000012"
    };

    const result = await service.addBookToShelf(input);

    expect(shelves.addBook).toHaveBeenCalledWith(input);
    expect(activity.append).toHaveBeenCalledWith({
      actorId: input.ownerId,
      verb: "book_added",
      bookId: input.bookId,
      shelfId: input.shelfId,
      visibility: "followers"
    });
    expect(result).toEqual(shelfItem);
  });

  it("addBookToShelf passes editionId when provided", async () => {
    const shelfItem = makeShelfItem({ editionId: "00000000-0000-0000-0000-000000000020" });
    const shelves: ShelfRepository = {
      listShelves: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      addBook: vi.fn().mockResolvedValue(shelfItem),
      rankShelfItem: vi.fn(),
      createSystemShelves: vi.fn()
    };
    const activity: ActivityRepository = {
      append: vi.fn().mockResolvedValue({ id: "evt-2", actorId: "u1", verb: "book_added", visibility: "followers", occurredAt: new Date() }),
      getFriendFeed: vi.fn()
    };

    const service = new ShelfService(shelves, activity);
    const input = {
      ownerId: "00000000-0000-0000-0000-000000000001",
      shelfId: "00000000-0000-0000-0000-000000000011",
      bookId: "00000000-0000-0000-0000-000000000012",
      editionId: "00000000-0000-0000-0000-000000000020"
    };

    const result = await service.addBookToShelf(input);

    expect(shelves.addBook).toHaveBeenCalledWith(input);
    expect(result.editionId).toBe(input.editionId);
  });
});

describe("ProfileService", () => {
  it("createProfile creates the profile and four system shelves", async () => {
    const profile = makeProfile();
    const systemShelves = SYSTEM_SHELVES.map((def, i) =>
      makeShelf({ id: `00000000-0000-0000-0000-00000000002${i}`, slug: def.slug, name: def.name, visibility: def.visibility })
    );

    const profileRepo: ProfileRepository = {
      findById: vi.fn(),
      findByHandle: vi.fn(),
      create: vi.fn().mockResolvedValue(profile),
      isHandleTaken: vi.fn(),
      setHandle: vi.fn()
    };
    const shelvesRepo: ShelfRepository = {
      listShelves: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      addBook: vi.fn(),
      rankShelfItem: vi.fn(),
      createSystemShelves: vi.fn().mockResolvedValue(systemShelves)
    };

    const service = new ProfileService(profileRepo, shelvesRepo);
    const result = await service.createProfile({
      id: profile.id,
      handle: profile.handle,
      displayName: profile.displayName,
      defaultVisibility: profile.defaultVisibility
    });

    expect(profileRepo.create).toHaveBeenCalledWith({
      id: profile.id,
      handle: profile.handle,
      displayName: profile.displayName,
      defaultVisibility: profile.defaultVisibility
    });
    expect(shelvesRepo.createSystemShelves).toHaveBeenCalledWith(profile.id);
    expect(result.profile).toEqual(profile);
    expect(result.shelves).toHaveLength(4);
  });

  it("createProfile creates exactly the four named system shelves", async () => {
    const profile = makeProfile();
    const systemShelves = SYSTEM_SHELVES.map((def, i) =>
      makeShelf({ id: `00000000-0000-0000-0000-00000000002${i}`, slug: def.slug, name: def.name, visibility: def.visibility })
    );

    const profileRepo: ProfileRepository = {
      findById: vi.fn(),
      findByHandle: vi.fn(),
      create: vi.fn().mockResolvedValue(profile),
      isHandleTaken: vi.fn(),
      setHandle: vi.fn()
    };
    const shelvesRepo: ShelfRepository = {
      listShelves: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      addBook: vi.fn(),
      rankShelfItem: vi.fn(),
      createSystemShelves: vi.fn().mockResolvedValue(systemShelves)
    };

    const service = new ProfileService(profileRepo, shelvesRepo);
    const result = await service.createProfile({
      id: profile.id,
      handle: profile.handle,
      displayName: profile.displayName,
      defaultVisibility: profile.defaultVisibility
    });

    const slugs = result.shelves.map((s) => s.slug);
    expect(slugs).toContain("reading");
    expect(slugs).toContain("want-to-read");
    expect(slugs).toContain("finished");
    expect(slugs).toContain("dropped");
  });

  it("SYSTEM_SHELVES has correct visibility defaults per PRD", () => {
    const bySlug = Object.fromEntries(SYSTEM_SHELVES.map((s) => [s.slug, s]));
    expect(bySlug["reading"]?.visibility).toBe("followers");
    expect(bySlug["want-to-read"]?.visibility).toBe("followers");
    expect(bySlug["finished"]?.visibility).toBe("public");
    expect(bySlug["dropped"]?.visibility).toBe("followers");
  });

  it("createProfile is idempotent — createSystemShelves called once per createProfile call", async () => {
    const profile = makeProfile();
    const systemShelves = SYSTEM_SHELVES.map((def, i) =>
      makeShelf({ id: `00000000-0000-0000-0000-00000000002${i}`, slug: def.slug, name: def.name, visibility: def.visibility })
    );

    const profileRepo: ProfileRepository = {
      findById: vi.fn(),
      findByHandle: vi.fn(),
      create: vi.fn().mockResolvedValue(profile),
      isHandleTaken: vi.fn(),
      setHandle: vi.fn()
    };
    const shelvesRepo: ShelfRepository = {
      listShelves: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      addBook: vi.fn(),
      rankShelfItem: vi.fn(),
      createSystemShelves: vi.fn().mockResolvedValue(systemShelves)
    };

    const service = new ProfileService(profileRepo, shelvesRepo);
    await service.createProfile({
      id: profile.id,
      handle: profile.handle,
      displayName: profile.displayName,
      defaultVisibility: profile.defaultVisibility
    });

    expect(shelvesRepo.createSystemShelves).toHaveBeenCalledTimes(1);
  });
});

describe("AppServices", () => {
  it("exposes shelves, handles, and profiles services", () => {
    const repositories: AppRepositories = {
      profiles: { findById: vi.fn(), findByHandle: vi.fn(), create: vi.fn(), isHandleTaken: vi.fn(), setHandle: vi.fn() },
      books: { findBookById: vi.fn(), findEditionByIsbn: vi.fn(), search: vi.fn() },
      shelves: { listShelves: vi.fn(), findById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), addBook: vi.fn(), rankShelfItem: vi.fn(), createSystemShelves: vi.fn() },
      reviews: { findById: vi.fn(), create: vi.fn(), update: vi.fn() },
      activity: { append: vi.fn(), getFriendFeed: vi.fn() },
      recommendations: { getForUser: vi.fn() },
      follows: { follow: vi.fn(), unfollow: vi.fn(), findFollow: vi.fn(), listFollowers: vi.fn(), listFollowing: vi.fn(), isMutual: vi.fn() },
      blocks: { block: vi.fn(), unblock: vi.fn(), findBlock: vi.fn(), listBlockedByUser: vi.fn(), listBlockingUser: vi.fn(), isBlocked: vi.fn() },
      rankings: { upsert: vi.fn(), findById: vi.fn(), findByOwnerAndBook: vi.fn(), listByOwner: vi.fn(), delete: vi.fn(), startBucket: vi.fn() },
      notifications: { registerToken: vi.fn(), removeToken: vi.fn(), listTokensForProfile: vi.fn(), getSetting: vi.fn(), setSetting: vi.fn(), listSettings: vi.fn() },
      imports: { create: vi.fn(), findById: vi.fn(), findByOwnerAndHash: vi.fn(), listByOwner: vi.fn(), updateStatus: vi.fn() },
      contacts: { upsertHashes: vi.fn(), findMatches: vi.fn(), deleteForUser: vi.fn(), deleteExpired: vi.fn(), listByUser: vi.fn() },
      lists: { create: vi.fn(), findById: vi.fn(), listByOwner: vi.fn(), update: vi.fn(), delete: vi.fn(), addItem: vi.fn(), removeItem: vi.fn(), listItems: vi.fn(), reorderItems: vi.fn() },
      authIdentities: { create: vi.fn(), findByProvider: vi.fn(), listByProfile: vi.fn() },
      sessions: { create: vi.fn(), findByTokenHash: vi.fn(), revokeByTokenHash: vi.fn(), revokeAllForProfile: vi.fn() },
      handleHistory: { record: vi.fn(), findCurrentByOldHandle: vi.fn() },
      magicLinks: { create: vi.fn(), findByTokenHash: vi.fn(), markConsumed: vi.fn(), deleteExpiredForEmail: vi.fn() }
    };
    const auth: AuthProvider = {
      getCurrentIdentity: vi.fn().mockResolvedValue(null)
    };

    const services = new AppServices(repositories, auth);

    expect(services.shelves).toBeInstanceOf(ShelfService);
    expect(services.handles).toBeInstanceOf(HandleService);
    expect(services.profiles).toBeInstanceOf(ProfileService);
    expect(services.repositories).toBe(repositories);
    expect(services.auth).toBe(auth);
  });
});

describe("ShelfService CRUD", () => {
  function makeShelfRepo(overrides?: Partial<ShelfRepository>): ShelfRepository {
    return {
      listShelves: vi.fn().mockResolvedValue([]),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      addBook: vi.fn(),
      rankShelfItem: vi.fn(),
      createSystemShelves: vi.fn(),
      ...overrides,
    };
  }
  function makeActivity(): ActivityRepository {
    return { append: vi.fn(), getFriendFeed: vi.fn() };
  }

  it("createShelf slugifies the name and delegates to shelves.create", async () => {
    const shelf = makeShelf({ name: "My Cool Shelf", slug: "my-cool-shelf", isSystem: false });
    const shelvesRepo = makeShelfRepo({ create: vi.fn().mockResolvedValue(shelf) });
    const service = new ShelfService(shelvesRepo, makeActivity());
    const result = await service.createShelf({ ownerId: "00000000-0000-0000-0000-000000000001", name: "My Cool Shelf", visibility: "public" });
    expect(shelvesRepo.create).toHaveBeenCalledWith(expect.objectContaining({ slug: "my-cool-shelf" }));
    expect(result.name).toBe("My Cool Shelf");
  });

  it("updateShelf throws NOT_FOUND when shelf does not exist", async () => {
    const shelvesRepo = makeShelfRepo({ findById: vi.fn().mockResolvedValue(null) });
    const service = new ShelfService(shelvesRepo, makeActivity());
    await expect(service.updateShelf({ id: "00000000-0000-0000-0000-000000000002", ownerId: "00000000-0000-0000-0000-000000000001", version: 1 }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("updateShelf throws FORBIDDEN when caller is not the owner", async () => {
    const shelf = makeShelf({ id: "00000000-0000-0000-0000-000000000002", ownerId: "00000000-0000-0000-0000-000000000099" });
    const shelvesRepo = makeShelfRepo({ findById: vi.fn().mockResolvedValue(shelf) });
    const service = new ShelfService(shelvesRepo, makeActivity());
    await expect(service.updateShelf({ id: shelf.id, ownerId: "00000000-0000-0000-0000-000000000001", version: 1 }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("updateShelf throws FORBIDDEN when shelf is a system shelf", async () => {
    const shelf = makeShelf({ ownerId: "00000000-0000-0000-0000-000000000001", isSystem: true });
    const shelvesRepo = makeShelfRepo({ findById: vi.fn().mockResolvedValue(shelf) });
    const service = new ShelfService(shelvesRepo, makeActivity());
    await expect(service.updateShelf({ id: shelf.id, ownerId: "00000000-0000-0000-0000-000000000001", version: 1 }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("updateShelf delegates to shelves.update when owner matches", async () => {
    const shelf = makeShelf({ ownerId: "00000000-0000-0000-0000-000000000001", isSystem: false });
    const updated = makeShelf({ ...shelf, name: "Updated", visibility: "private" });
    const shelvesRepo = makeShelfRepo({ findById: vi.fn().mockResolvedValue(shelf), update: vi.fn().mockResolvedValue(updated) });
    const service = new ShelfService(shelvesRepo, makeActivity());
    const result = await service.updateShelf({ id: shelf.id, ownerId: shelf.ownerId, version: shelf.version, name: "Updated", visibility: "private" });
    expect(result.name).toBe("Updated");
  });

  it("deleteShelf throws NOT_FOUND when shelf does not exist", async () => {
    const shelvesRepo = makeShelfRepo({ findById: vi.fn().mockResolvedValue(null) });
    const service = new ShelfService(shelvesRepo, makeActivity());
    await expect(service.deleteShelf({ id: "00000000-0000-0000-0000-000000000002", ownerId: "00000000-0000-0000-0000-000000000001" }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("deleteShelf throws FORBIDDEN when caller is not the owner", async () => {
    const shelf = makeShelf({ id: "00000000-0000-0000-0000-000000000002", ownerId: "00000000-0000-0000-0000-000000000099" });
    const shelvesRepo = makeShelfRepo({ findById: vi.fn().mockResolvedValue(shelf) });
    const service = new ShelfService(shelvesRepo, makeActivity());
    await expect(service.deleteShelf({ id: shelf.id, ownerId: "00000000-0000-0000-0000-000000000001" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("deleteShelf throws FORBIDDEN when shelf is a system shelf", async () => {
    const shelf = makeShelf({ ownerId: "00000000-0000-0000-0000-000000000001", isSystem: true });
    const shelvesRepo = makeShelfRepo({ findById: vi.fn().mockResolvedValue(shelf) });
    const service = new ShelfService(shelvesRepo, makeActivity());
    await expect(service.deleteShelf({ id: shelf.id, ownerId: "00000000-0000-0000-0000-000000000001" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("deleteShelf delegates to shelves.delete when owner matches", async () => {
    const shelf = makeShelf({ ownerId: "00000000-0000-0000-0000-000000000001", isSystem: false });
    const shelvesRepo = makeShelfRepo({ findById: vi.fn().mockResolvedValue(shelf), delete: vi.fn().mockResolvedValue(undefined) });
    const service = new ShelfService(shelvesRepo, makeActivity());
    await service.deleteShelf({ id: shelf.id, ownerId: shelf.ownerId });
    expect(shelvesRepo.delete).toHaveBeenCalledWith({ id: shelf.id, ownerId: shelf.ownerId });
  });

  it("listShelves delegates to shelves.listShelves", async () => {
    const shelf = makeShelf();
    const shelvesRepo = makeShelfRepo({ listShelves: vi.fn().mockResolvedValue([shelf]) });
    const service = new ShelfService(shelvesRepo, makeActivity());
    const result = await service.listShelves("00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000002");
    expect(shelvesRepo.listShelves).toHaveBeenCalledWith("00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000002");
    expect(result).toHaveLength(1);
  });
});

describe("slugify", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    expect(slugify("My Cool Shelf")).toBe("my-cool-shelf");
  });

  it("strips leading and trailing hyphens", () => {
    expect(slugify("  My Shelf  ")).toBe("my-shelf");
  });

  it("collapses multiple non-alphanumeric chars into one hyphen", () => {
    expect(slugify("Hello!! World")).toBe("hello-world");
  });
});

describe("RankingService", () => {
  function makeRankingsRepo(overrides?: Partial<RankingRepository>): RankingRepository {
    return {
      upsert: vi.fn(),
      findById: vi.fn(),
      findByOwnerAndBook: vi.fn(),
      listByOwner: vi.fn(),
      delete: vi.fn(),
      startBucket: vi.fn(),
      ...overrides,
    };
  }

  function makeActivity(overrides?: Partial<ActivityRepository>): ActivityRepository {
    return { append: vi.fn(), getFriendFeed: vi.fn(), ...overrides };
  }

  it("startBucket delegates to rankings.startBucket", async () => {
    const now = new Date();
    const ranking: Ranking = {
      id: "00000000-0000-0000-0000-000000000001",
      profileId: "00000000-0000-0000-0000-000000000001",
      bookId: "00000000-0000-0000-0000-000000000002",
      position: 0,
      score: 0,
      bucket: 3,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    const rankingsRepo = makeRankingsRepo({ startBucket: vi.fn().mockResolvedValue(ranking) });
    const service = new RankingService(rankingsRepo, makeActivity());
    const result = await service.startBucket({ ownerId: ranking.profileId, bookId: ranking.bookId, bucket: 3 });
    expect(rankingsRepo.startBucket).toHaveBeenCalledWith({ ownerId: ranking.profileId, bookId: ranking.bookId, bucket: 3 });
    expect(result.bucket).toBe(3);
  });

  it("finishBook upserts ranking with derived score and appends activity event with frozen score", async () => {
    const now = new Date();
    const ranking: Ranking = {
      id: "00000000-0000-0000-0000-000000000001",
      profileId: "00000000-0000-0000-0000-000000000001",
      bookId: "00000000-0000-0000-0000-000000000002",
      position: 5,
      score: 5.56,
      bucket: 3,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    const event = {
      id: "evt-1",
      actorId: "00000000-0000-0000-0000-000000000001",
      verb: "book_finished" as const,
      bookId: "00000000-0000-0000-0000-000000000002",
      visibility: "followers" as const,
      occurredAt: now,
      scoreAtPublish: 5.56,
      scoreLockedAtPublish: false,
    };
    const rankingsRepo = makeRankingsRepo({ upsert: vi.fn().mockResolvedValue(ranking) });
    const activity = makeActivity({ append: vi.fn().mockResolvedValue(event) });
    const service = new RankingService(rankingsRepo, activity);

    const result = await service.finishBook({
      ownerId: "00000000-0000-0000-0000-000000000001",
      bookId: "00000000-0000-0000-0000-000000000002",
      position: 5,
      total: 10,
    });

    // scoreFromRank(5, 10) = (10-5)/(10-1)*10 = 5/9*10 = 5.56
    expect(rankingsRepo.upsert).toHaveBeenCalledWith({
      ownerId: "00000000-0000-0000-0000-000000000001",
      bookId: "00000000-0000-0000-0000-000000000002",
      rank: 5,
      score: 5.56,
    });
    expect(activity.append).toHaveBeenCalledWith({
      actorId: "00000000-0000-0000-0000-000000000001",
      verb: "book_finished",
      bookId: "00000000-0000-0000-0000-000000000002",
      visibility: "followers",
      scoreAtPublish: 5.56,
      scoreLockedAtPublish: false,
    });
    expect(result.ranking).toEqual(ranking);
    expect(result.event).toEqual(event);
  });

  it("finishBook sets scoreLockedAtPublish=true when total < 10", async () => {
    const now = new Date();
    const ranking: Ranking = {
      id: "r1",
      profileId: "owner1",
      bookId: "book1",
      position: 1,
      score: 10,
      bucket: 5,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    const event = {
      id: "evt-1",
      actorId: "owner1",
      verb: "book_finished" as const,
      bookId: "book1",
      visibility: "followers" as const,
      occurredAt: now,
      scoreAtPublish: 10,
      scoreLockedAtPublish: true,
    };
    const rankingsRepo = makeRankingsRepo({ upsert: vi.fn().mockResolvedValue(ranking) });
    const activity = makeActivity({ append: vi.fn().mockResolvedValue(event) });
    const service = new RankingService(rankingsRepo, activity);

    await service.finishBook({
      ownerId: "owner1",
      bookId: "book1",
      position: 1,
      total: 5,
    });

    expect(activity.append).toHaveBeenCalledWith(
      expect.objectContaining({ scoreLockedAtPublish: true })
    );
  });

  it("finishBook sets scoreLockedAtPublish=false when total >= 10", async () => {
    const now = new Date();
    const ranking: Ranking = {
      id: "r1",
      profileId: "owner1",
      bookId: "book1",
      position: 5,
      score: 5.56,
      bucket: 3,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    const event = {
      id: "evt-1",
      actorId: "owner1",
      verb: "book_finished" as const,
      bookId: "book1",
      visibility: "followers" as const,
      occurredAt: now,
      scoreAtPublish: 5.56,
      scoreLockedAtPublish: false,
    };
    const rankingsRepo = makeRankingsRepo({ upsert: vi.fn().mockResolvedValue(ranking) });
    const activity = makeActivity({ append: vi.fn().mockResolvedValue(event) });
    const service = new RankingService(rankingsRepo, activity);

    await service.finishBook({
      ownerId: "owner1",
      bookId: "book1",
      position: 5,
      total: 10,
    });

    expect(activity.append).toHaveBeenCalledWith(
      expect.objectContaining({ scoreLockedAtPublish: false })
    );
  });

  it("finishBook freezes score at publish time (snapshot in activity event)", async () => {
    const now = new Date();
    const ranking: Ranking = {
      id: "r1",
      profileId: "owner1",
      bookId: "book1",
      position: 2,
      score: 7.5,
      bucket: 4,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    const event = {
      id: "evt-1",
      actorId: "owner1",
      verb: "book_finished" as const,
      bookId: "book1",
      visibility: "followers" as const,
      occurredAt: now,
      scoreAtPublish: 7.5,
      scoreLockedAtPublish: false,
    };
    const rankingsRepo = makeRankingsRepo({ upsert: vi.fn().mockResolvedValue(ranking) });
    const activity = makeActivity({ append: vi.fn().mockResolvedValue(event) });
    const service = new RankingService(rankingsRepo, activity);

    const result = await service.finishBook({
      ownerId: "owner1",
      bookId: "book1",
      position: 2,
      total: 5,
    });

    // scoreFromRank(2, 5) = 7.5
    expect(result.event.scoreAtPublish).toBe(7.5);
    expect(activity.append).toHaveBeenCalledWith(
      expect.objectContaining({ scoreAtPublish: 7.5 })
    );
  });
});

describe("ReviewService", () => {
  function makeReviewRepo(overrides?: Partial<ReviewRepository>): ReviewRepository {
    return { findById: vi.fn(), create: vi.fn(), update: vi.fn(), ...overrides };
  }
  function makeActivity(): ActivityRepository {
    return { append: vi.fn(), getFriendFeed: vi.fn() };
  }

  it("createReview creates the review and appends activity event", async () => {
    const now = new Date();
    const review: Review = {
      id: "00000000-0000-0000-0000-000000000001",
      authorId: "00000000-0000-0000-0000-000000000002",
      bookId: "00000000-0000-0000-0000-000000000003",
      body: "Great book",
      visibility: "public",
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    const reviewRepo = makeReviewRepo({ create: vi.fn().mockResolvedValue(review) });
    const activity = makeActivity();
    (activity.append as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "evt-1", actorId: review.authorId, verb: "book_reviewed", visibility: "public", occurredAt: now });

    const service = new ReviewService(reviewRepo, activity);
    const result = await service.createReview({
      authorId: review.authorId,
      bookId: review.bookId,
      body: review.body,
      visibility: review.visibility,
    });

    expect(reviewRepo.create).toHaveBeenCalledWith(expect.objectContaining({ body: "Great book" }));
    expect(activity.append).toHaveBeenCalledWith(expect.objectContaining({ verb: "book_reviewed", bookId: review.bookId }));
    expect(result.body).toBe("Great book");
  });

  it("createReview passes editionId when provided", async () => {
    const now = new Date();
    const editionId = "00000000-0000-0000-0000-000000000099";
    const review: Review = {
      id: "00000000-0000-0000-0000-000000000001",
      authorId: "00000000-0000-0000-0000-000000000002",
      bookId: "00000000-0000-0000-0000-000000000003",
      editionId,
      body: "With edition",
      visibility: "followers",
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    const reviewRepo = makeReviewRepo({ create: vi.fn().mockResolvedValue(review) });
    const activity = makeActivity();
    (activity.append as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "evt-2", actorId: review.authorId, verb: "book_reviewed", visibility: "followers", occurredAt: now });

    const service = new ReviewService(reviewRepo, activity);
    const result = await service.createReview({
      authorId: review.authorId,
      bookId: review.bookId,
      editionId,
      body: review.body,
      visibility: review.visibility,
    });

    expect(reviewRepo.create).toHaveBeenCalledWith(expect.objectContaining({ editionId }));
    expect(result.editionId).toBe(editionId);
  });
});

type TestKeyPair = { privateKey: CryptoKey; publicKey: CryptoKey; jwk: AppleJwk };

async function generateTestRsaKeyPair(): Promise<TestKeyPair> {
  const keyPair = await subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"]
  ) as CryptoKeyPair;
  const pubJwk = await subtle.exportKey("jwk", keyPair.publicKey);
  const jwk: AppleJwk = {
    kty: pubJwk.kty!,
    kid: "test-kid-1",
    use: "sig",
    alg: "RS256",
    n: pubJwk.n!,
    e: pubJwk.e!,
  };
  return { privateKey: keyPair.privateKey, publicKey: keyPair.publicKey, jwk };
}

function encodeB64Url(obj: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

async function buildSignedJwt(payload: Record<string, unknown>, privateKey: CryptoKey, kid: string): Promise<string> {
  const header = encodeB64Url({ alg: "RS256", kid });
  const body = encodeB64Url(payload);
  const signingInput = `${header}.${body}`;
  const signature = await subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(signingInput));
  const sigB64 = Buffer.from(signature).toString("base64url");
  return `${signingInput}.${sigB64}`;
}

describe("AuthService", () => {
  const APPLE_AUD = "com.hone.app";
  const FUTURE_EXP = Math.floor(Date.now() / 1000) + 3600;

  function makeAuthIdentityRepo(overrides?: Partial<AuthIdentityRepository>): AuthIdentityRepository {
    return { create: vi.fn(), findByProvider: vi.fn().mockResolvedValue(null), listByProfile: vi.fn(), ...overrides };
  }

  function makeSessionRepo(overrides?: Partial<SessionRepository>): SessionRepository {
    return {
      create: vi.fn().mockResolvedValue({ tokenHash: "hash", profileId: "p1", expiresAt: new Date(Date.now() + 86400000) }),
      findByTokenHash: vi.fn(),
      revokeByTokenHash: vi.fn(),
      revokeAllForProfile: vi.fn(),
      ...overrides,
    };
  }

  it("validateAppleToken rejects token with wrong issuer", async () => {
    const { privateKey, jwk } = await generateTestRsaKeyPair();
    const payload = { iss: "https://evil.com", aud: APPLE_AUD, exp: FUTURE_EXP, sub: "u1", iat: 0 };
    const token = await buildSignedJwt(payload, privateKey, jwk.kid);
    const jwksProvider: AppleJwksProvider = { fetchKeys: vi.fn().mockResolvedValue([jwk]) };
    const service = new AuthService(makeAuthIdentityRepo(), makeSessionRepo(), jwksProvider, APPLE_AUD);
    await expect(service.validateAppleToken(token)).rejects.toMatchObject({ code: "INVALID_TOKEN" });
  });

  it("validateAppleToken rejects token with wrong audience", async () => {
    const { privateKey, jwk } = await generateTestRsaKeyPair();
    const payload = { iss: "https://appleid.apple.com", aud: "com.wrong.app", exp: FUTURE_EXP, sub: "u1", iat: 0 };
    const token = await buildSignedJwt(payload, privateKey, jwk.kid);
    const jwksProvider: AppleJwksProvider = { fetchKeys: vi.fn().mockResolvedValue([jwk]) };
    const service = new AuthService(makeAuthIdentityRepo(), makeSessionRepo(), jwksProvider, APPLE_AUD);
    await expect(service.validateAppleToken(token)).rejects.toMatchObject({ code: "INVALID_TOKEN" });
  });

  it("validateAppleToken rejects expired token", async () => {
    const { privateKey, jwk } = await generateTestRsaKeyPair();
    const payload = { iss: "https://appleid.apple.com", aud: APPLE_AUD, exp: Math.floor(Date.now() / 1000) - 10, sub: "u1", iat: 0 };
    const token = await buildSignedJwt(payload, privateKey, jwk.kid);
    const jwksProvider: AppleJwksProvider = { fetchKeys: vi.fn().mockResolvedValue([jwk]) };
    const service = new AuthService(makeAuthIdentityRepo(), makeSessionRepo(), jwksProvider, APPLE_AUD);
    await expect(service.validateAppleToken(token)).rejects.toMatchObject({ code: "TOKEN_EXPIRED" });
  });

  it("validateAppleToken rejects token with nonce mismatch", async () => {
    const { privateKey, jwk } = await generateTestRsaKeyPair();
    const payload = { iss: "https://appleid.apple.com", aud: APPLE_AUD, exp: FUTURE_EXP, sub: "u1", iat: 0, nonce: "expected-nonce" };
    const token = await buildSignedJwt(payload, privateKey, jwk.kid);
    const jwksProvider: AppleJwksProvider = { fetchKeys: vi.fn().mockResolvedValue([jwk]) };
    const service = new AuthService(makeAuthIdentityRepo(), makeSessionRepo(), jwksProvider, APPLE_AUD);
    await expect(service.validateAppleToken(token, "wrong-nonce")).rejects.toMatchObject({ code: "INVALID_TOKEN" });
  });

  it("validateAppleToken rejects token when no matching JWKS key found", async () => {
    const { privateKey, jwk } = await generateTestRsaKeyPair();
    const payload = { iss: "https://appleid.apple.com", aud: APPLE_AUD, exp: FUTURE_EXP, sub: "u1", iat: 0 };
    const token = await buildSignedJwt(payload, privateKey, jwk.kid);
    const otherJwk: AppleJwk = { ...jwk, kid: "different-kid" };
    const jwksProvider: AppleJwksProvider = { fetchKeys: vi.fn().mockResolvedValue([otherJwk]) };
    const service = new AuthService(makeAuthIdentityRepo(), makeSessionRepo(), jwksProvider, APPLE_AUD);
    await expect(service.validateAppleToken(token)).rejects.toMatchObject({ code: "INVALID_TOKEN" });
  });

  it("validateAppleToken rejects token with invalid signature", async () => {
    const { jwk } = await generateTestRsaKeyPair();
    const { privateKey: otherPrivateKey } = await generateTestRsaKeyPair();
    const payload = { iss: "https://appleid.apple.com", aud: APPLE_AUD, exp: FUTURE_EXP, sub: "u1", iat: 0 };
    const token = await buildSignedJwt(payload, otherPrivateKey, jwk.kid);
    const jwksProvider: AppleJwksProvider = { fetchKeys: vi.fn().mockResolvedValue([jwk]) };
    const service = new AuthService(makeAuthIdentityRepo(), makeSessionRepo(), jwksProvider, APPLE_AUD);
    await expect(service.validateAppleToken(token)).rejects.toMatchObject({ code: "INVALID_TOKEN" });
  });

  it("validateAppleToken accepts a valid token and returns claims", async () => {
    const { privateKey, jwk } = await generateTestRsaKeyPair();
    const payload = { iss: "https://appleid.apple.com", aud: APPLE_AUD, exp: FUTURE_EXP, sub: "apple-sub-123", iat: 0, email: "user@example.com", email_verified: true };
    const token = await buildSignedJwt(payload, privateKey, jwk.kid);
    const jwksProvider: AppleJwksProvider = { fetchKeys: vi.fn().mockResolvedValue([jwk]) };
    const service = new AuthService(makeAuthIdentityRepo(), makeSessionRepo(), jwksProvider, APPLE_AUD);
    const claims = await service.validateAppleToken(token);
    expect(claims.sub).toBe("apple-sub-123");
    expect(claims.email).toBe("user@example.com");
  });

  it("validateAppleToken accepts valid token and nonce when they match", async () => {
    const { privateKey, jwk } = await generateTestRsaKeyPair();
    const payload = { iss: "https://appleid.apple.com", aud: APPLE_AUD, exp: FUTURE_EXP, sub: "u1", iat: 0, nonce: "my-nonce" };
    const token = await buildSignedJwt(payload, privateKey, jwk.kid);
    const jwksProvider: AppleJwksProvider = { fetchKeys: vi.fn().mockResolvedValue([jwk]) };
    const service = new AuthService(makeAuthIdentityRepo(), makeSessionRepo(), jwksProvider, APPLE_AUD);
    const claims = await service.validateAppleToken(token, "my-nonce");
    expect(claims.sub).toBe("u1");
  });

  it("validateAppleToken rejects malformed token (not three parts)", async () => {
    const jwksProvider: AppleJwksProvider = { fetchKeys: vi.fn() };
    const service = new AuthService(makeAuthIdentityRepo(), makeSessionRepo(), jwksProvider, APPLE_AUD);
    await expect(service.validateAppleToken("notavalidjwt")).rejects.toMatchObject({ code: "INVALID_TOKEN" });
  });

  it("normalizeAppleEmail returns undefined when email is absent", () => {
    const jwksProvider: AppleJwksProvider = { fetchKeys: vi.fn() };
    const service = new AuthService(makeAuthIdentityRepo(), makeSessionRepo(), jwksProvider, APPLE_AUD);
    const result = service.normalizeAppleEmail({ sub: "u1", aud: APPLE_AUD, iss: "https://appleid.apple.com", exp: FUTURE_EXP, iat: 0 });
    expect(result).toBeUndefined();
  });

  it("normalizeAppleEmail lowercases and trims non-relay email", () => {
    const jwksProvider: AppleJwksProvider = { fetchKeys: vi.fn() };
    const service = new AuthService(makeAuthIdentityRepo(), makeSessionRepo(), jwksProvider, APPLE_AUD);
    const result = service.normalizeAppleEmail({ sub: "u1", aud: APPLE_AUD, iss: "https://appleid.apple.com", exp: FUTURE_EXP, iat: 0, email: "  User@Example.COM  ", is_private_email: false });
    expect(result).toBe("user@example.com");
  });

  it("normalizeAppleEmail passes relay email through unchanged (boolean true)", () => {
    const jwksProvider: AppleJwksProvider = { fetchKeys: vi.fn() };
    const service = new AuthService(makeAuthIdentityRepo(), makeSessionRepo(), jwksProvider, APPLE_AUD);
    const relayEmail = "abc123@privaterelay.appleid.com";
    const result = service.normalizeAppleEmail({ sub: "u1", aud: APPLE_AUD, iss: "https://appleid.apple.com", exp: FUTURE_EXP, iat: 0, email: relayEmail, is_private_email: true });
    expect(result).toBe(relayEmail);
  });

  it("normalizeAppleEmail passes relay email through unchanged (string 'true')", () => {
    const jwksProvider: AppleJwksProvider = { fetchKeys: vi.fn() };
    const service = new AuthService(makeAuthIdentityRepo(), makeSessionRepo(), jwksProvider, APPLE_AUD);
    const relayEmail = "abc123@privaterelay.appleid.com";
    const result = service.normalizeAppleEmail({ sub: "u1", aud: APPLE_AUD, iss: "https://appleid.apple.com", exp: FUTURE_EXP, iat: 0, email: relayEmail, is_private_email: "true" });
    expect(result).toBe(relayEmail);
  });

  it("appleSignIn creates new identity and session for new user, returns valid UUID-4 pattern", async () => {
    const { privateKey, jwk } = await generateTestRsaKeyPair();
    const payload = { iss: "https://appleid.apple.com", aud: APPLE_AUD, exp: FUTURE_EXP, sub: "new-apple-user", iat: 0 };
    const token = await buildSignedJwt(payload, privateKey, jwk.kid);
    const jwksProvider: AppleJwksProvider = { fetchKeys: vi.fn().mockResolvedValue([jwk]) };
    const mockSession = { tokenHash: "h1", profileId: "p1", expiresAt: new Date(Date.now() + 86400000) };
    const authIdentityRepo = makeAuthIdentityRepo({
      findByProvider: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(async (input) => ({ provider: input.provider, providerUserId: input.providerUserId, profileId: input.profileId })),
    });
    const sessionRepo = makeSessionRepo({ create: vi.fn().mockResolvedValue(mockSession) });
    const service = new AuthService(authIdentityRepo, sessionRepo, jwksProvider, APPLE_AUD);
    const result = await service.appleSignIn(token);
    expect(result.isNewUser).toBe(true);
    expect(result.sessionToken).toBeTruthy();
    expect(result.expiresAt).toBeInstanceOf(Date);
    const createMock = authIdentityRepo.create as ReturnType<typeof vi.fn>;
    const firstCall = createMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    const firstArg = firstCall![0] as { profileId: string };
    expect(firstArg.profileId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("appleSignIn links existing identity when user already exists", async () => {
    const { privateKey, jwk } = await generateTestRsaKeyPair();
    const payload = { iss: "https://appleid.apple.com", aud: APPLE_AUD, exp: FUTURE_EXP, sub: "existing-apple-user", iat: 0 };
    const token = await buildSignedJwt(payload, privateKey, jwk.kid);
    const jwksProvider: AppleJwksProvider = { fetchKeys: vi.fn().mockResolvedValue([jwk]) };
    const existingIdentity = { provider: "apple", providerUserId: "existing-apple-user", profileId: "00000000-0000-0000-0000-000000000042" };
    const authIdentityRepo = makeAuthIdentityRepo({ findByProvider: vi.fn().mockResolvedValue(existingIdentity) });
    const sessionRepo = makeSessionRepo();
    const service = new AuthService(authIdentityRepo, sessionRepo, jwksProvider, APPLE_AUD);
    const result = await service.appleSignIn(token);
    expect(result.isNewUser).toBe(false);
    expect(authIdentityRepo.create).not.toHaveBeenCalled();
    expect(sessionRepo.create).toHaveBeenCalledWith(expect.objectContaining({ profileId: existingIdentity.profileId }));
  });
});

describe("AuthService – Google", () => {
  const GOOGLE_AUD = "test-google-client-id.apps.googleusercontent.com";
  const FUTURE_EXP = Math.floor(Date.now() / 1000) + 3600;

  function makeAuthIdentityRepo(overrides?: Partial<AuthIdentityRepository>): AuthIdentityRepository {
    return { create: vi.fn(), findByProvider: vi.fn().mockResolvedValue(null), listByProfile: vi.fn(), ...overrides };
  }

  function makeSessionRepo(overrides?: Partial<SessionRepository>): SessionRepository {
    return {
      create: vi.fn().mockResolvedValue({ tokenHash: "hash", profileId: "p1", expiresAt: new Date(Date.now() + 86400000) }),
      findByTokenHash: vi.fn(),
      revokeByTokenHash: vi.fn(),
      revokeAllForProfile: vi.fn(),
      ...overrides,
    };
  }

  async function generateGoogleKeyPair(): Promise<{ privateKey: CryptoKey; jwk: GoogleJwk }> {
    const keyPair = await subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["sign", "verify"]
    ) as CryptoKeyPair;
    const pubJwk = await subtle.exportKey("jwk", keyPair.publicKey);
    const jwk: GoogleJwk = { kty: pubJwk.kty!, kid: "google-test-kid-1", use: "sig", alg: "RS256", n: pubJwk.n!, e: pubJwk.e! };
    return { privateKey: keyPair.privateKey, jwk };
  }

  function makeService(googleJwksProvider: GoogleJwksProvider, authIdentityRepo?: AuthIdentityRepository, sessionRepo?: SessionRepository): AuthService {
    const stubAppleProvider: AppleJwksProvider = { fetchKeys: vi.fn().mockResolvedValue([]) };
    return new AuthService(
      authIdentityRepo ?? makeAuthIdentityRepo(),
      sessionRepo ?? makeSessionRepo(),
      stubAppleProvider,
      "com.hone.app",
      googleJwksProvider,
      GOOGLE_AUD
    );
  }

  it("validateGoogleToken rejects token with wrong issuer", async () => {
    const { privateKey, jwk } = await generateGoogleKeyPair();
    const payload = { iss: "https://evil.com", aud: GOOGLE_AUD, exp: FUTURE_EXP, sub: "g1", iat: 0 };
    const token = await buildSignedJwt(payload, privateKey, jwk.kid);
    const googleJwksProvider: GoogleJwksProvider = { fetchKeys: vi.fn().mockResolvedValue([jwk]) };
    const service = makeService(googleJwksProvider);
    await expect(service.validateGoogleToken(token)).rejects.toMatchObject({ code: "INVALID_TOKEN" });
  });

  it("validateGoogleToken accepts accounts.google.com as issuer", async () => {
    const { privateKey, jwk } = await generateGoogleKeyPair();
    const payload = { iss: "accounts.google.com", aud: GOOGLE_AUD, exp: FUTURE_EXP, sub: "g1", iat: 0 };
    const token = await buildSignedJwt(payload, privateKey, jwk.kid);
    const googleJwksProvider: GoogleJwksProvider = { fetchKeys: vi.fn().mockResolvedValue([jwk]) };
    const service = makeService(googleJwksProvider);
    const claims = await service.validateGoogleToken(token);
    expect(claims.sub).toBe("g1");
  });

  it("validateGoogleToken rejects token with wrong audience", async () => {
    const { privateKey, jwk } = await generateGoogleKeyPair();
    const payload = { iss: "https://accounts.google.com", aud: "com.wrong.app", exp: FUTURE_EXP, sub: "g1", iat: 0 };
    const token = await buildSignedJwt(payload, privateKey, jwk.kid);
    const googleJwksProvider: GoogleJwksProvider = { fetchKeys: vi.fn().mockResolvedValue([jwk]) };
    const service = makeService(googleJwksProvider);
    await expect(service.validateGoogleToken(token)).rejects.toMatchObject({ code: "INVALID_TOKEN" });
  });

  it("validateGoogleToken rejects expired token", async () => {
    const { privateKey, jwk } = await generateGoogleKeyPair();
    const payload = { iss: "https://accounts.google.com", aud: GOOGLE_AUD, exp: Math.floor(Date.now() / 1000) - 10, sub: "g1", iat: 0 };
    const token = await buildSignedJwt(payload, privateKey, jwk.kid);
    const googleJwksProvider: GoogleJwksProvider = { fetchKeys: vi.fn().mockResolvedValue([jwk]) };
    const service = makeService(googleJwksProvider);
    await expect(service.validateGoogleToken(token)).rejects.toMatchObject({ code: "TOKEN_EXPIRED" });
  });

  it("validateGoogleToken rejects token when no matching JWKS key", async () => {
    const { privateKey, jwk } = await generateGoogleKeyPair();
    const payload = { iss: "https://accounts.google.com", aud: GOOGLE_AUD, exp: FUTURE_EXP, sub: "g1", iat: 0 };
    const token = await buildSignedJwt(payload, privateKey, jwk.kid);
    const googleJwksProvider: GoogleJwksProvider = { fetchKeys: vi.fn().mockResolvedValue([]) };
    const service = makeService(googleJwksProvider);
    await expect(service.validateGoogleToken(token)).rejects.toMatchObject({ code: "INVALID_TOKEN" });
  });

  it("validateGoogleToken rejects malformed token (not three parts)", async () => {
    const googleJwksProvider: GoogleJwksProvider = { fetchKeys: vi.fn() };
    const service = makeService(googleJwksProvider);
    await expect(service.validateGoogleToken("notavalidjwt")).rejects.toMatchObject({ code: "INVALID_TOKEN" });
  });

  it("validateGoogleToken rejects token with invalid signature", async () => {
    const { privateKey, jwk } = await generateGoogleKeyPair();
    const { jwk: otherJwk } = await generateGoogleKeyPair();
    const payload = { iss: "https://accounts.google.com", aud: GOOGLE_AUD, exp: FUTURE_EXP, sub: "g1", iat: 0 };
    const token = await buildSignedJwt(payload, privateKey, jwk.kid);
    const wrongJwk = { ...otherJwk, kid: jwk.kid };
    const googleJwksProvider: GoogleJwksProvider = { fetchKeys: vi.fn().mockResolvedValue([wrongJwk]) };
    const service = makeService(googleJwksProvider);
    await expect(service.validateGoogleToken(token)).rejects.toMatchObject({ code: "INVALID_TOKEN" });
  });

  it("validateGoogleToken accepts a valid token and returns claims", async () => {
    const { privateKey, jwk } = await generateGoogleKeyPair();
    const payload = { iss: "https://accounts.google.com", aud: GOOGLE_AUD, exp: FUTURE_EXP, sub: "google-sub-123", iat: 0, email: "user@gmail.com", email_verified: true };
    const token = await buildSignedJwt(payload, privateKey, jwk.kid);
    const googleJwksProvider: GoogleJwksProvider = { fetchKeys: vi.fn().mockResolvedValue([jwk]) };
    const service = makeService(googleJwksProvider);
    const claims = await service.validateGoogleToken(token);
    expect(claims.sub).toBe("google-sub-123");
    expect(claims.email).toBe("user@gmail.com");
  });

  it("googleSignIn creates new identity and session for new user, returns valid UUID-4 pattern", async () => {
    const { privateKey, jwk } = await generateGoogleKeyPair();
    const payload = { iss: "https://accounts.google.com", aud: GOOGLE_AUD, exp: FUTURE_EXP, sub: "new-google-user", iat: 0 };
    const token = await buildSignedJwt(payload, privateKey, jwk.kid);
    const googleJwksProvider: GoogleJwksProvider = { fetchKeys: vi.fn().mockResolvedValue([jwk]) };
    const authIdentityRepo = makeAuthIdentityRepo({
      findByProvider: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(async (input: { provider: string; providerUserId: string; profileId: string }) => ({ provider: input.provider, providerUserId: input.providerUserId, profileId: input.profileId })),
    });
    const sessionRepo = makeSessionRepo();
    const service = makeService(googleJwksProvider, authIdentityRepo, sessionRepo);
    const result = await service.googleSignIn(token);
    expect(result.isNewUser).toBe(true);
    expect(result.sessionToken).toBeTruthy();
    expect(result.expiresAt).toBeInstanceOf(Date);
    const createMock = authIdentityRepo.create as ReturnType<typeof vi.fn>;
    const firstCall = createMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    const firstArg = firstCall![0] as { provider: string; profileId: string };
    expect(firstArg.provider).toBe("google");
    expect(firstArg.profileId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("googleSignIn links existing identity when user already exists", async () => {
    const { privateKey, jwk } = await generateGoogleKeyPair();
    const payload = { iss: "https://accounts.google.com", aud: GOOGLE_AUD, exp: FUTURE_EXP, sub: "existing-google-user", iat: 0 };
    const token = await buildSignedJwt(payload, privateKey, jwk.kid);
    const googleJwksProvider: GoogleJwksProvider = { fetchKeys: vi.fn().mockResolvedValue([jwk]) };
    const existingIdentity = { provider: "google", providerUserId: "existing-google-user", profileId: "00000000-0000-0000-0000-000000000099" };
    const authIdentityRepo = makeAuthIdentityRepo({ findByProvider: vi.fn().mockResolvedValue(existingIdentity) });
    const sessionRepo = makeSessionRepo();
    const service = makeService(googleJwksProvider, authIdentityRepo, sessionRepo);
    const result = await service.googleSignIn(token);
    expect(result.isNewUser).toBe(false);
    expect(authIdentityRepo.create).not.toHaveBeenCalled();
    expect(sessionRepo.create).toHaveBeenCalledWith(expect.objectContaining({ profileId: existingIdentity.profileId }));
  });

  it("googleSignIn throws INVALID_TOKEN when Google JWKS provider not configured", async () => {
    const stubAppleProvider: AppleJwksProvider = { fetchKeys: vi.fn().mockResolvedValue([]) };
    const service = new AuthService(
      makeAuthIdentityRepo(),
      makeSessionRepo(),
      stubAppleProvider,
      "com.hone.app"
    );
    await expect(service.googleSignIn("any.token.here")).rejects.toMatchObject({ code: "INVALID_TOKEN" });
  });
});

function makeBlockRepo(outgoing: Block[] = [], incoming: Block[] = []): BlockRepository {
  return {
    block: vi.fn(),
    unblock: vi.fn(),
    findBlock: vi.fn(),
    listBlockedByUser: vi.fn().mockResolvedValue(outgoing),
    listBlockingUser: vi.fn().mockResolvedValue(incoming),
    isBlocked: vi.fn(),
  };
}

function makeBlock(blockerId: string, blockedId: string): Block {
  return { id: `block-${blockerId}-${blockedId}`, blockerId, blockedId, createdAt: new Date() };
}

function makeFollow(followerId: string, followeeId: string): Follow {
  return { id: `follow-${followerId}-${followeeId}`, followerId, followeeId, createdAt: new Date() };
}

function makeList(ownerId: string): List {
  const now = new Date();
  return { id: `list-${ownerId}`, ownerId, title: "My List", visibility: "public", createdAt: now, updatedAt: now };
}

function makeFeedItem(actorId: string): FeedItem {
  const now = new Date();
  return {
    event: { id: `evt-${actorId}`, actorId, verb: "book_finished", visibility: "followers", occurredAt: now },
    actor: makeProfile({ id: actorId }),
  };
}

describe("BlockService", () => {
  it("removeBlocked returns all items when no blocks exist", async () => {
    const blockRepo = makeBlockRepo([], []);
    const service = new BlockService(blockRepo);
    const profiles = [makeProfile({ id: "u1" }), makeProfile({ id: "u2" })];
    const result = await service.removeBlocked("viewer", profiles);
    expect(result).toHaveLength(2);
  });

  it("removeBlocked removes item whose id matches an outgoing blocked user", async () => {
    const blockRepo = makeBlockRepo([makeBlock("viewer", "u2")], []);
    const service = new BlockService(blockRepo);
    const profiles = [makeProfile({ id: "u1" }), makeProfile({ id: "u2" })];
    const result = await service.removeBlocked("viewer", profiles);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("u1");
  });

  it("removeBlocked removes item whose id matches an incoming block (user who blocked viewer)", async () => {
    const blockRepo = makeBlockRepo([], [makeBlock("u2", "viewer")]);
    const service = new BlockService(blockRepo);
    const profiles = [makeProfile({ id: "u1" }), makeProfile({ id: "u2" })];
    const result = await service.removeBlocked("viewer", profiles);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("u1");
  });

  it("removeBlocked returns empty list immediately without querying when items is empty", async () => {
    const blockRepo = makeBlockRepo();
    const service = new BlockService(blockRepo);
    const result = await service.removeBlocked("viewer", []);
    expect(blockRepo.listBlockedByUser).not.toHaveBeenCalled();
    expect(result).toHaveLength(0);
  });

  it("removeBlockedFeedItems removes feed items from blocked actors", async () => {
    const blockRepo = makeBlockRepo([makeBlock("viewer", "actor-blocked")], []);
    const service = new BlockService(blockRepo);
    const items = [makeFeedItem("actor-ok"), makeFeedItem("actor-blocked")];
    const result = await service.removeBlockedFeedItems("viewer", items);
    expect(result).toHaveLength(1);
    expect(result[0]!.event.actorId).toBe("actor-ok");
  });

  it("removeBlockedFeedItems removes feed items from actors who blocked the viewer", async () => {
    const blockRepo = makeBlockRepo([], [makeBlock("actor-blocked", "viewer")]);
    const service = new BlockService(blockRepo);
    const items = [makeFeedItem("actor-ok"), makeFeedItem("actor-blocked")];
    const result = await service.removeBlockedFeedItems("viewer", items);
    expect(result).toHaveLength(1);
    expect(result[0]!.event.actorId).toBe("actor-ok");
  });

  it("removeBlockedFollows filters out blocked follower by followerId", async () => {
    const blockRepo = makeBlockRepo([makeBlock("viewer", "u-blocked")], []);
    const service = new BlockService(blockRepo);
    const follows = [makeFollow("u-ok", "viewer"), makeFollow("u-blocked", "viewer")];
    const result = await service.removeBlockedFollows("viewer", follows, (f) => f.followerId);
    expect(result).toHaveLength(1);
    expect(result[0]!.followerId).toBe("u-ok");
  });

  it("removeBlockedFollows filters out blocked followee by followeeId", async () => {
    const blockRepo = makeBlockRepo([makeBlock("viewer", "u-blocked")], []);
    const service = new BlockService(blockRepo);
    const follows = [makeFollow("viewer", "u-ok"), makeFollow("viewer", "u-blocked")];
    const result = await service.removeBlockedFollows("viewer", follows, (f) => f.followeeId);
    expect(result).toHaveLength(1);
    expect(result[0]!.followeeId).toBe("u-ok");
  });

  it("removeBlockedLists filters lists from blocked owners", async () => {
    const blockRepo = makeBlockRepo([makeBlock("viewer", "owner-blocked")], []);
    const service = new BlockService(blockRepo);
    const lists = [makeList("owner-ok"), makeList("owner-blocked")];
    const result = await service.removeBlockedLists("viewer", lists);
    expect(result).toHaveLength(1);
    expect(result[0]!.ownerId).toBe("owner-ok");
  });

  it("removeBlockedIds filters blocked user ids", async () => {
    const blockRepo = makeBlockRepo([makeBlock("viewer", "u-blocked")], []);
    const service = new BlockService(blockRepo);
    const ids = ["u-ok", "u-blocked"];
    const result = await service.removeBlockedIds("viewer", ids);
    expect(result).toEqual(["u-ok"]);
  });

  it("Property: blocked users never appear in removeBlocked results", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.uuid(), { minLength: 1, maxLength: 10 }),
        fc.array(fc.uuid(), { minLength: 1, maxLength: 10 }),
        fc.uuid(),
        async (outgoingIds, incomingIds, viewerId) => {
          const outgoing = outgoingIds.map((id) => makeBlock(viewerId, id));
          const incoming = incomingIds.map((id) => makeBlock(id, viewerId));
          const allBlockedIds = new Set([...outgoingIds, ...incomingIds]);

          const blockRepo = makeBlockRepo(outgoing, incoming);
          const service = new BlockService(blockRepo);

          const items = [...outgoingIds, ...incomingIds].map((id) => makeProfile({ id }));
          const result = await service.removeBlocked(viewerId, items);

          return result.every((item) => !allBlockedIds.has(item.id));
        }
      )
    );
  });

  it("Property: blocked actor ids never appear in removeBlockedFeedItems results", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }),
        fc.uuid(),
        async (blockedActorIds, viewerId) => {
          const outgoing = blockedActorIds.map((id) => makeBlock(viewerId, id));
          const blockRepo = makeBlockRepo(outgoing, []);
          const service = new BlockService(blockRepo);

          const items = blockedActorIds.map((id) => makeFeedItem(id));
          const result = await service.removeBlockedFeedItems(viewerId, items);

          return result.length === 0;
        }
      )
    );
  });
});

describe("SocialService", () => {
  function makeFollowRepo(followers: Follow[] = [], following: Follow[] = []): FollowRepository {
    return {
      follow: vi.fn(),
      unfollow: vi.fn(),
      findFollow: vi.fn(),
      listFollowers: vi.fn().mockResolvedValue(followers),
      listFollowing: vi.fn().mockResolvedValue(following),
      isMutual: vi.fn(),
    };
  }

  function makeContactsRepo(matches: string[] = []): ContactsRepository {
    return {
      upsertHashes: vi.fn(),
      findMatches: vi.fn().mockResolvedValue(matches),
      deleteForUser: vi.fn(),
      deleteExpired: vi.fn(),
      listByUser: vi.fn(),
    };
  }

  function makeRecsRepo(recs: Recommendation[] = []): RecommendationRepository {
    return {
      getForUser: vi.fn().mockResolvedValue(recs),
    };
  }

  function makeActivityRepo(feedItems: FeedItem[] = []): ActivityRepository {
    return {
      append: vi.fn(),
      getFriendFeed: vi.fn().mockResolvedValue(feedItems),
    };
  }

  function makeProfilesRepo(profile: Profile | null = null): ProfileRepository {
    return {
      findById: vi.fn(),
      findByHandle: vi.fn().mockResolvedValue(profile),
      create: vi.fn(),
      isHandleTaken: vi.fn(),
      setHandle: vi.fn(),
    };
  }

  function makeListsRepo(lists: List[] = []): ListRepository {
    return {
      create: vi.fn(),
      findById: vi.fn(),
      listByOwner: vi.fn().mockResolvedValue(lists),
      update: vi.fn(),
      delete: vi.fn(),
      addItem: vi.fn(),
      removeItem: vi.fn(),
      listItems: vi.fn(),
      reorderItems: vi.fn(),
    };
  }

  function makeSocialService(opts: {
    followers?: Follow[];
    following?: Follow[];
    outgoing?: Block[];
    incoming?: Block[];
    contactMatches?: string[];
    feedItems?: FeedItem[];
    profile?: Profile | null;
    lists?: List[];
    recs?: Recommendation[];
  } = {}) {
    return new SocialService(
      makeFollowRepo(opts.followers, opts.following),
      makeBlockRepo(opts.outgoing ?? [], opts.incoming ?? []),
      makeContactsRepo(opts.contactMatches ?? []),
      makeRecsRepo(opts.recs ?? []),
      makeActivityRepo(opts.feedItems ?? []),
      makeProfilesRepo(opts.profile ?? null),
      makeListsRepo(opts.lists ?? []),
    );
  }

  it("listFollowers removes blocked followers", async () => {
    const service = makeSocialService({
      followers: [makeFollow("u-ok", "owner"), makeFollow("u-blocked", "owner")],
      outgoing: [makeBlock("viewer", "u-blocked")],
    });
    const result = await service.listFollowers("owner", "viewer");
    expect(result).toHaveLength(1);
    expect(result[0]!.followerId).toBe("u-ok");
  });

  it("listFollowers removes followers who blocked the viewer", async () => {
    const service = makeSocialService({
      followers: [makeFollow("u-ok", "owner"), makeFollow("u-blocked", "owner")],
      incoming: [makeBlock("u-blocked", "viewer")],
    });
    const result = await service.listFollowers("owner", "viewer");
    expect(result).toHaveLength(1);
    expect(result[0]!.followerId).toBe("u-ok");
  });

  it("listFollowing removes blocked followees", async () => {
    const service = makeSocialService({
      following: [makeFollow("viewer", "u-ok"), makeFollow("viewer", "u-blocked")],
      outgoing: [makeBlock("viewer", "u-blocked")],
    });
    const result = await service.listFollowing("viewer", "viewer");
    expect(result).toHaveLength(1);
    expect(result[0]!.followeeId).toBe("u-ok");
  });

  it("findContactMatches removes blocked user ids from matches", async () => {
    const service = makeSocialService({
      contactMatches: ["u-ok", "u-blocked"],
      outgoing: [makeBlock("viewer", "u-blocked")],
    });
    const result = await service.findContactMatches({ hashes: ["h1", "h2"], viewerId: "viewer" });
    expect(result).toEqual(["u-ok"]);
  });

  it("findContactMatches removes contacts who blocked the viewer", async () => {
    const service = makeSocialService({
      contactMatches: ["u-ok", "u-blocked"],
      incoming: [makeBlock("u-blocked", "viewer")],
    });
    const result = await service.findContactMatches({ hashes: ["h1"], viewerId: "viewer" });
    expect(result).toEqual(["u-ok"]);
  });

  it("getFriendFeed removes feed items from blocked actors", async () => {
    const service = makeSocialService({
      feedItems: [makeFeedItem("u-ok"), makeFeedItem("u-blocked")],
      outgoing: [makeBlock("viewer", "u-blocked")],
    });
    const result = await service.getFriendFeed({ viewerId: "viewer", limit: 20 });
    expect(result).toHaveLength(1);
    expect(result[0]!.event.actorId).toBe("u-ok");
  });

  it("getFriendFeed removes feed items from actors who blocked the viewer", async () => {
    const service = makeSocialService({
      feedItems: [makeFeedItem("u-ok"), makeFeedItem("u-blocked")],
      incoming: [makeBlock("u-blocked", "viewer")],
    });
    const result = await service.getFriendFeed({ viewerId: "viewer", limit: 20 });
    expect(result).toHaveLength(1);
    expect(result[0]!.event.actorId).toBe("u-ok");
  });

  it("searchProfiles returns null when handle not found", async () => {
    const service = makeSocialService({ profile: null });
    const result = await service.searchProfiles("unknown", "viewer");
    expect(result).toBeNull();
  });

  it("searchProfiles returns null when the found profile is blocked", async () => {
    const profile = makeProfile({ id: "u-blocked" });
    const service = makeSocialService({
      profile,
      outgoing: [makeBlock("viewer", "u-blocked")],
    });
    const result = await service.searchProfiles("u-blocked", "viewer");
    expect(result).toBeNull();
  });

  it("searchProfiles returns null when found profile has blocked the viewer", async () => {
    const profile = makeProfile({ id: "u-blocked" });
    const service = makeSocialService({
      profile,
      incoming: [makeBlock("u-blocked", "viewer")],
    });
    const result = await service.searchProfiles("u-blocked", "viewer");
    expect(result).toBeNull();
  });

  it("searchProfiles returns profile when no block relationship exists", async () => {
    const profile = makeProfile({ id: "u-ok" });
    const service = makeSocialService({ profile });
    const result = await service.searchProfiles("u-ok", "viewer");
    expect(result).toEqual(profile);
  });

  it("discoverLists removes lists from blocked owners", async () => {
    const service = makeSocialService({
      lists: [makeList("owner-ok"), makeList("owner-blocked")],
      outgoing: [makeBlock("viewer", "owner-blocked")],
    });
    const result = await service.discoverLists("any", "viewer");
    expect(result).toHaveLength(1);
    expect(result[0]!.ownerId).toBe("owner-ok");
  });

  it("discoverLists removes lists from owners who blocked the viewer", async () => {
    const service = makeSocialService({
      lists: [makeList("owner-ok"), makeList("owner-blocked")],
      incoming: [makeBlock("owner-blocked", "viewer")],
    });
    const result = await service.discoverLists("any", "viewer");
    expect(result).toHaveLength(1);
    expect(result[0]!.ownerId).toBe("owner-ok");
  });

  it("getRecommendations calls removeBlocked on the recs surface", async () => {
    const now = new Date();
    const recs: Recommendation[] = [
      { book: { id: "book-1", canonicalTitle: "Book One", createdAt: now, updatedAt: now }, score: 0.9, reason: "popular" },
      { book: { id: "book-2", canonicalTitle: "Book Two", createdAt: now, updatedAt: now }, score: 0.8, reason: "friend liked" },
    ];
    const service = makeSocialService({ recs });
    const result = await service.getRecommendations("viewer", 10);
    expect(result).toHaveLength(2);
  });

  it("getRecommendations returns recs even when sourceUserIdFn returns undefined (book recs have no user owner)", async () => {
    const now = new Date();
    const recs: Recommendation[] = [
      { book: { id: "book-1", canonicalTitle: "Book One", createdAt: now, updatedAt: now }, score: 0.9, reason: "popular" },
    ];
    const service = makeSocialService({
      recs,
      outgoing: [makeBlock("viewer", "some-other-user")],
    });
    const result = await service.getRecommendations("viewer", 10);
    expect(result).toHaveLength(1);
  });
});

describe("FollowService", () => {
  const UUID1 = "00000000-0000-0000-0000-000000000001";
  const UUID2 = "00000000-0000-0000-0000-000000000002";
  const UUID3 = "00000000-0000-0000-0000-000000000003";
  const NOW = new Date();

  function makeFollowObj(overrides?: Partial<Follow>): Follow {
    return { id: UUID3, followerId: UUID1, followeeId: UUID2, createdAt: NOW, ...overrides };
  }

  function makeFollowRepo(overrides?: Partial<FollowRepository>): FollowRepository {
    return {
      follow: vi.fn().mockResolvedValue(makeFollowObj()),
      unfollow: vi.fn().mockResolvedValue(undefined),
      findFollow: vi.fn().mockResolvedValue(null),
      listFollowers: vi.fn().mockResolvedValue([]),
      listFollowing: vi.fn().mockResolvedValue([]),
      isMutual: vi.fn().mockResolvedValue(false),
      ...overrides,
    };
  }

  function makeBlockRepo(overrides?: Partial<BlockRepository>): BlockRepository {
    return {
      block: vi.fn(),
      unblock: vi.fn(),
      findBlock: vi.fn().mockResolvedValue(null),
      listBlockedByUser: vi.fn().mockResolvedValue([]),
      listBlockingUser: vi.fn().mockResolvedValue([]),
      isBlocked: vi.fn().mockResolvedValue(false),
      ...overrides,
    };
  }

  it("createFollow creates a new follow relationship", async () => {
    const follow = makeFollowObj();
    const followRepo = makeFollowRepo({ follow: vi.fn().mockResolvedValue(follow) });
    const blockRepo = makeBlockRepo();
    const service = new FollowService(followRepo, blockRepo);

    const result = await service.createFollow({ followerId: UUID1, followeeId: UUID2 });

    expect(followRepo.follow).toHaveBeenCalledWith({ followerId: UUID1, followeeId: UUID2 });
    expect(result).toEqual(follow);
  });

  it("createFollow is idempotent - returns existing follow", async () => {
    const existing = makeFollowObj();
    const followRepo = makeFollowRepo({ findFollow: vi.fn().mockResolvedValue(existing) });
    const blockRepo = makeBlockRepo();
    const service = new FollowService(followRepo, blockRepo);

    const result = await service.createFollow({ followerId: UUID1, followeeId: UUID2 });

    expect(followRepo.follow).not.toHaveBeenCalled();
    expect(result).toEqual(existing);
  });

  it("createFollow throws BAD_REQUEST when following yourself", async () => {
    const followRepo = makeFollowRepo();
    const blockRepo = makeBlockRepo();
    const service = new FollowService(followRepo, blockRepo);

    await expect(service.createFollow({ followerId: UUID1, followeeId: UUID1 }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("createFollow throws FORBIDDEN when blocked by target", async () => {
    const followRepo = makeFollowRepo();
    const blockRepo = makeBlockRepo({
      findBlock: vi.fn().mockImplementation(({ blockerId, blockedId }) => {
        if (blockerId === UUID2 && blockedId === UUID1) {
          return Promise.resolve({ id: "b1", blockerId: UUID2, blockedId: UUID1, createdAt: NOW });
        }
        return Promise.resolve(null);
      }),
    });
    const service = new FollowService(followRepo, blockRepo);

    await expect(service.createFollow({ followerId: UUID1, followeeId: UUID2 }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("createFollow throws FORBIDDEN when follower has blocked the target", async () => {
    const followRepo = makeFollowRepo();
    const blockRepo = makeBlockRepo({
      findBlock: vi.fn().mockImplementation(({ blockerId, blockedId }) => {
        if (blockerId === UUID1 && blockedId === UUID2) {
          return Promise.resolve({ id: "b1", blockerId: UUID1, blockedId: UUID2, createdAt: NOW });
        }
        return Promise.resolve(null);
      }),
    });
    const service = new FollowService(followRepo, blockRepo);

    await expect(service.createFollow({ followerId: UUID1, followeeId: UUID2 }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("deleteFollow removes an existing follow", async () => {
    const existing = makeFollowObj();
    const followRepo = makeFollowRepo({ findFollow: vi.fn().mockResolvedValue(existing) });
    const blockRepo = makeBlockRepo();
    const service = new FollowService(followRepo, blockRepo);

    await service.deleteFollow({ followerId: UUID1, followeeId: UUID2 });

    expect(followRepo.unfollow).toHaveBeenCalledWith({ followerId: UUID1, followeeId: UUID2 });
  });

  it("deleteFollow is idempotent - does nothing when not following", async () => {
    const followRepo = makeFollowRepo({ findFollow: vi.fn().mockResolvedValue(null) });
    const blockRepo = makeBlockRepo();
    const service = new FollowService(followRepo, blockRepo);

    await service.deleteFollow({ followerId: UUID1, followeeId: UUID2 });

    expect(followRepo.unfollow).not.toHaveBeenCalled();
  });

  it("listFollowers returns followers filtered by blocks", async () => {
    const followers: Follow[] = [
      makeFollowObj({ id: "f1", followerId: UUID2, followeeId: UUID1 }),
      makeFollowObj({ id: "f2", followerId: UUID3, followeeId: UUID1 }),
    ];
    const followRepo = makeFollowRepo({ listFollowers: vi.fn().mockResolvedValue(followers) });
    const blockRepo = makeBlockRepo({
      listBlockedByUser: vi.fn().mockResolvedValue([{ id: "b1", blockerId: UUID1, blockedId: UUID3, createdAt: NOW }]),
    });
    const service = new FollowService(followRepo, blockRepo);

    const result = await service.listFollowers(UUID1, UUID1, 50);

    expect(result).toHaveLength(1);
    expect(result[0]!.followerId).toBe(UUID2);
  });

  it("listFollowing returns following filtered by blocks", async () => {
    const following: Follow[] = [
      makeFollowObj({ id: "f1", followerId: UUID1, followeeId: UUID2 }),
      makeFollowObj({ id: "f2", followerId: UUID1, followeeId: UUID3 }),
    ];
    const followRepo = makeFollowRepo({ listFollowing: vi.fn().mockResolvedValue(following) });
    const blockRepo = makeBlockRepo({
      listBlockedByUser: vi.fn().mockResolvedValue([{ id: "b1", blockerId: UUID1, blockedId: UUID3, createdAt: NOW }]),
    });
    const service = new FollowService(followRepo, blockRepo);

    const result = await service.listFollowing(UUID1, UUID1, 50);

    expect(result).toHaveLength(1);
    expect(result[0]!.followeeId).toBe(UUID2);
  });
});
