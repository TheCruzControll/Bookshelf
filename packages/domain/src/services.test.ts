import { describe, it, expect, vi } from "vitest";
import * as fc from "fast-check";
import { subtle } from "node:crypto";
import { AccountDeletionService, ShelfService, HandleService, AppServices, ProfileService, RankingService, AuthService, MagicLinkService, ReviewService, BlockService, SocialService, FollowService, ContactsService, SessionService, SYSTEM_SHELVES, POSTURE_C_DEFAULTS, slugify, computeGroupKey, NotificationService, encodeFeedCursor, decodeFeedCursor, groupFeedItems } from "./services";
import type { ActivityRepository, AppRepositories, AuthProvider, BlockRepository, ContactsRepository, EmailProvider, FollowRepository, ListRepository, MagicLinkRepository, ProfileRepository, RankingRepository, AuthIdentityRepository, RecommendationRepository, SessionRepository, AppleJwksProvider, AppleJwk, GoogleJwksProvider, GoogleJwk, ReviewRepository, ShelfRepository, InAppNotificationRepository } from "./ports";
import type { Block, FeedItem, Follow, List, Profile, Ranking, Recommendation, Review, Shelf, ShelfItem, InAppNotification } from "./types";

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
    verified: false,
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
      createSystemShelves: vi.fn(),
      findShelfItem: vi.fn(),
      upsertShelfItem: vi.fn(),
      deleteShelfItem: vi.fn(),
      getMaxPosition: vi.fn().mockResolvedValue(0),
      moveShelfItem: vi.fn(),
      listOwnersWithBookOnSystemShelf: vi.fn().mockResolvedValue([]),
      listShelfItemsByOwner: vi.fn().mockResolvedValue([])
    };
    const activity: ActivityRepository = {
      append: vi.fn().mockResolvedValue({ id: "evt-1", actorId: "u1", verb: "book_added", visibility: "followers", occurredAt: new Date() }),
      getFriendFeed: vi.fn(),
      getFriendFeedGrouped: vi.fn(),
      deleteByReviewId: vi.fn(),
      listByActor: vi.fn().mockResolvedValue([])
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
      createSystemShelves: vi.fn(),
      findShelfItem: vi.fn(),
      upsertShelfItem: vi.fn(),
      deleteShelfItem: vi.fn(),
      getMaxPosition: vi.fn().mockResolvedValue(0),
      moveShelfItem: vi.fn(),
      listOwnersWithBookOnSystemShelf: vi.fn().mockResolvedValue([]),
      listShelfItemsByOwner: vi.fn().mockResolvedValue([])
    };
    const activity: ActivityRepository = {
      append: vi.fn().mockResolvedValue({ id: "evt-2", actorId: "u1", verb: "book_added", visibility: "followers", occurredAt: new Date() }),
      getFriendFeed: vi.fn(),
      getFriendFeedGrouped: vi.fn(),
      deleteByReviewId: vi.fn(),
      listByActor: vi.fn().mockResolvedValue([])
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
      createSystemShelves: vi.fn().mockResolvedValue(systemShelves),
      findShelfItem: vi.fn(),
      upsertShelfItem: vi.fn(),
      deleteShelfItem: vi.fn(),
      getMaxPosition: vi.fn().mockResolvedValue(0),
      moveShelfItem: vi.fn(),
      listOwnersWithBookOnSystemShelf: vi.fn().mockResolvedValue([]),
      listShelfItemsByOwner: vi.fn().mockResolvedValue([])
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
      createSystemShelves: vi.fn().mockResolvedValue(systemShelves),
      findShelfItem: vi.fn(),
      upsertShelfItem: vi.fn(),
      deleteShelfItem: vi.fn(),
      getMaxPosition: vi.fn().mockResolvedValue(0),
      moveShelfItem: vi.fn(),
      listOwnersWithBookOnSystemShelf: vi.fn().mockResolvedValue([]),
      listShelfItemsByOwner: vi.fn().mockResolvedValue([])
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
      createSystemShelves: vi.fn().mockResolvedValue(systemShelves),
      findShelfItem: vi.fn(),
      upsertShelfItem: vi.fn(),
      deleteShelfItem: vi.fn(),
      getMaxPosition: vi.fn().mockResolvedValue(0),
      moveShelfItem: vi.fn(),
      listOwnersWithBookOnSystemShelf: vi.fn().mockResolvedValue([]),
      listShelfItemsByOwner: vi.fn().mockResolvedValue([])
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
      accountDeletions: { create: vi.fn(), findByProfileId: vi.fn().mockResolvedValue(null), delete: vi.fn(), listExpired: vi.fn().mockResolvedValue([]), purgeProfile: vi.fn() },
    deletedProfileTombstones: { create: vi.fn(), findByHandle: vi.fn().mockResolvedValue(null), purgeExpired: vi.fn().mockResolvedValue(0) },
      profiles: { findById: vi.fn(), findByHandle: vi.fn(), create: vi.fn(), isHandleTaken: vi.fn(), setHandle: vi.fn() },
      books: { findBookById: vi.fn(), findEditionByIsbn: vi.fn(), findBookByIsbn13: vi.fn().mockResolvedValue(null), search: vi.fn(), upsertFromCatalogResult: vi.fn(), createManual: vi.fn() },
      shelves: { listShelves: vi.fn(), findById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), addBook: vi.fn(), rankShelfItem: vi.fn(), createSystemShelves: vi.fn(), findShelfItem: vi.fn(), upsertShelfItem: vi.fn(), deleteShelfItem: vi.fn(), getMaxPosition: vi.fn().mockResolvedValue(0), moveShelfItem: vi.fn(), listOwnersWithBookOnSystemShelf: vi.fn().mockResolvedValue([]), listShelfItemsByOwner: vi.fn().mockResolvedValue([]) },
      reviews: { findById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), listByAuthor: vi.fn().mockResolvedValue([]) },
      activity: { append: vi.fn(), getFriendFeed: vi.fn(), getFriendFeedGrouped: vi.fn(), deleteByReviewId: vi.fn(), listByActor: vi.fn().mockResolvedValue([]) },
      recommendations: { getForUser: vi.fn() },
      follows: { follow: vi.fn(), unfollow: vi.fn(), findFollow: vi.fn(), listFollowers: vi.fn(), listFollowing: vi.fn(), isMutual: vi.fn(), countMutuals: vi.fn().mockResolvedValue(0), listMutualIds: vi.fn().mockResolvedValue([]),
      listFriendsOfFriends: vi.fn().mockResolvedValue([]) },
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
    const auth: AuthProvider = {
      getCurrentIdentity: vi.fn().mockResolvedValue(null)
    };

    const services = new AppServices(repositories, auth);

    expect(services.shelves).toBeInstanceOf(ShelfService);
    expect(services.handles).toBeInstanceOf(HandleService);
    expect(services.profiles).toBeInstanceOf(ProfileService);
    expect(services.contacts).toBeInstanceOf(ContactsService);
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
      findShelfItem: vi.fn(),
      upsertShelfItem: vi.fn(),
      deleteShelfItem: vi.fn(),
      getMaxPosition: vi.fn().mockResolvedValue(0),
      moveShelfItem: vi.fn(),
      listOwnersWithBookOnSystemShelf: vi.fn().mockResolvedValue([]),
      listShelfItemsByOwner: vi.fn().mockResolvedValue([]),
      ...overrides,
    };
  }
  function makeActivity(): ActivityRepository {
    return { append: vi.fn(), getFriendFeed: vi.fn(), getFriendFeedGrouped: vi.fn(), deleteByReviewId: vi.fn(), listByActor: vi.fn().mockResolvedValue([]) };
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

  it("publishShelf sets publishedAt on a list shelf", async () => {
    const shelf = makeShelf({ ownerId: "00000000-0000-0000-0000-000000000001", isSystem: false, kind: "list" });
    const published = makeShelf({ ...shelf, publishedAt: new Date() });
    const shelvesRepo = makeShelfRepo({ findById: vi.fn().mockResolvedValue(shelf), update: vi.fn().mockResolvedValue(published) });
    const service = new ShelfService(shelvesRepo, makeActivity());
    const result = await service.publishShelf({ id: shelf.id, ownerId: shelf.ownerId, version: 1 });
    expect(shelvesRepo.update).toHaveBeenCalledWith(expect.objectContaining({ publishedAt: expect.any(Date) }));
    expect(result.publishedAt).toBeTruthy();
  });

  it("publishShelf throws NOT_FOUND when shelf does not exist", async () => {
    const shelvesRepo = makeShelfRepo({ findById: vi.fn().mockResolvedValue(null) });
    const service = new ShelfService(shelvesRepo, makeActivity());
    await expect(service.publishShelf({ id: "00000000-0000-0000-0000-000000000002", ownerId: "00000000-0000-0000-0000-000000000001", version: 1 }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("publishShelf throws FORBIDDEN when caller is not the owner", async () => {
    const shelf = makeShelf({ ownerId: "00000000-0000-0000-0000-000000000099", kind: "list" });
    const shelvesRepo = makeShelfRepo({ findById: vi.fn().mockResolvedValue(shelf) });
    const service = new ShelfService(shelvesRepo, makeActivity());
    await expect(service.publishShelf({ id: shelf.id, ownerId: "00000000-0000-0000-0000-000000000001", version: 1 }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("publishShelf throws BAD_REQUEST when shelf kind is not list", async () => {
    const shelf = makeShelf({ ownerId: "00000000-0000-0000-0000-000000000001", kind: "custom" });
    const shelvesRepo = makeShelfRepo({ findById: vi.fn().mockResolvedValue(shelf) });
    const service = new ShelfService(shelvesRepo, makeActivity());
    await expect(service.publishShelf({ id: shelf.id, ownerId: shelf.ownerId, version: 1 }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("publishShelf is idempotent when already published", async () => {
    const shelf = makeShelf({ ownerId: "00000000-0000-0000-0000-000000000001", kind: "list", publishedAt: new Date() });
    const shelvesRepo = makeShelfRepo({ findById: vi.fn().mockResolvedValue(shelf) });
    const service = new ShelfService(shelvesRepo, makeActivity());
    const result = await service.publishShelf({ id: shelf.id, ownerId: shelf.ownerId, version: 1 });
    expect(shelvesRepo.update).not.toHaveBeenCalled();
    expect(result).toEqual(shelf);
  });

  it("unpublishShelf clears publishedAt on a list shelf", async () => {
    const shelf = makeShelf({ ownerId: "00000000-0000-0000-0000-000000000001", isSystem: false, kind: "list", publishedAt: new Date() });
    const unpublished = makeShelf({ ...shelf, publishedAt: undefined });
    const shelvesRepo = makeShelfRepo({ findById: vi.fn().mockResolvedValue(shelf), update: vi.fn().mockResolvedValue(unpublished) });
    const service = new ShelfService(shelvesRepo, makeActivity());
    const result = await service.unpublishShelf({ id: shelf.id, ownerId: shelf.ownerId, version: 1 });
    expect(shelvesRepo.update).toHaveBeenCalledWith(expect.objectContaining({ publishedAt: null }));
    expect(result.publishedAt).toBeFalsy();
  });

  it("unpublishShelf throws NOT_FOUND when shelf does not exist", async () => {
    const shelvesRepo = makeShelfRepo({ findById: vi.fn().mockResolvedValue(null) });
    const service = new ShelfService(shelvesRepo, makeActivity());
    await expect(service.unpublishShelf({ id: "00000000-0000-0000-0000-000000000002", ownerId: "00000000-0000-0000-0000-000000000001", version: 1 }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("unpublishShelf throws FORBIDDEN when caller is not the owner", async () => {
    const shelf = makeShelf({ ownerId: "00000000-0000-0000-0000-000000000099", kind: "list", publishedAt: new Date() });
    const shelvesRepo = makeShelfRepo({ findById: vi.fn().mockResolvedValue(shelf) });
    const service = new ShelfService(shelvesRepo, makeActivity());
    await expect(service.unpublishShelf({ id: shelf.id, ownerId: "00000000-0000-0000-0000-000000000001", version: 1 }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("unpublishShelf throws BAD_REQUEST when shelf kind is not list", async () => {
    const shelf = makeShelf({ ownerId: "00000000-0000-0000-0000-000000000001", kind: "custom", publishedAt: new Date() });
    const shelvesRepo = makeShelfRepo({ findById: vi.fn().mockResolvedValue(shelf) });
    const service = new ShelfService(shelvesRepo, makeActivity());
    await expect(service.unpublishShelf({ id: shelf.id, ownerId: shelf.ownerId, version: 1 }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("unpublishShelf is idempotent when already unpublished", async () => {
    const shelf = makeShelf({ ownerId: "00000000-0000-0000-0000-000000000001", kind: "list" });
    const shelvesRepo = makeShelfRepo({ findById: vi.fn().mockResolvedValue(shelf) });
    const service = new ShelfService(shelvesRepo, makeActivity());
    const result = await service.unpublishShelf({ id: shelf.id, ownerId: shelf.ownerId, version: 1 });
    expect(shelvesRepo.update).not.toHaveBeenCalled();
    expect(result).toEqual(shelf);
  });

  it("publishShelf throws FORBIDDEN when authorType is internal_editorial and profile is not verified", async () => {
    const shelf = makeShelf({ ownerId: "00000000-0000-0000-0000-000000000001", isSystem: false, kind: "list" });
    const shelvesRepo = makeShelfRepo({ findById: vi.fn().mockResolvedValue(shelf) });
    const profilesRepo: ProfileRepository = {
      findById: vi.fn().mockResolvedValue(makeProfile({ verified: false })),
      findByHandle: vi.fn(),
      create: vi.fn(),
      isHandleTaken: vi.fn(),
      setHandle: vi.fn(),
    };
    const service = new ShelfService(shelvesRepo, makeActivity(), profilesRepo);
    await expect(service.publishShelf({ id: shelf.id, ownerId: shelf.ownerId, version: 1, authorType: "internal_editorial" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("publishShelf succeeds when authorType is internal_editorial and profile is verified", async () => {
    const shelf = makeShelf({ ownerId: "00000000-0000-0000-0000-000000000001", isSystem: false, kind: "list" });
    const published = makeShelf({ ...shelf, publishedAt: new Date(), authorType: "internal_editorial" });
    const shelvesRepo = makeShelfRepo({ findById: vi.fn().mockResolvedValue(shelf), update: vi.fn().mockResolvedValue(published) });
    const profilesRepo: ProfileRepository = {
      findById: vi.fn().mockResolvedValue(makeProfile({ verified: true })),
      findByHandle: vi.fn(),
      create: vi.fn(),
      isHandleTaken: vi.fn(),
      setHandle: vi.fn(),
    };
    const service = new ShelfService(shelvesRepo, makeActivity(), profilesRepo);
    const result = await service.publishShelf({ id: shelf.id, ownerId: shelf.ownerId, version: 1, authorType: "internal_editorial" });
    expect(shelvesRepo.update).toHaveBeenCalledWith(expect.objectContaining({ authorType: "internal_editorial" }));
    expect(result.authorType).toBe("internal_editorial");
  });

  it("publishShelf allows user authorType without verified check", async () => {
    const shelf = makeShelf({ ownerId: "00000000-0000-0000-0000-000000000001", isSystem: false, kind: "list" });
    const published = makeShelf({ ...shelf, publishedAt: new Date() });
    const shelvesRepo = makeShelfRepo({ findById: vi.fn().mockResolvedValue(shelf), update: vi.fn().mockResolvedValue(published) });
    const service = new ShelfService(shelvesRepo, makeActivity());
    const result = await service.publishShelf({ id: shelf.id, ownerId: shelf.ownerId, version: 1, authorType: "user" });
    expect(result.publishedAt).toBeTruthy();
  });

  it("publishShelf enforces verified check when existing shelf has internal_editorial authorType", async () => {
    const shelf = makeShelf({ ownerId: "00000000-0000-0000-0000-000000000001", isSystem: false, kind: "list", authorType: "internal_editorial" });
    const shelvesRepo = makeShelfRepo({ findById: vi.fn().mockResolvedValue(shelf) });
    const profilesRepo: ProfileRepository = {
      findById: vi.fn().mockResolvedValue(makeProfile({ verified: false })),
      findByHandle: vi.fn(),
      create: vi.fn(),
      isHandleTaken: vi.fn(),
      setHandle: vi.fn(),
    };
    const service = new ShelfService(shelvesRepo, makeActivity(), profilesRepo);
    await expect(service.publishShelf({ id: shelf.id, ownerId: shelf.ownerId, version: 1 }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("ShelfService – ShelfItem CRUD", () => {
  function makeShelfRepo(overrides?: Partial<ShelfRepository>): ShelfRepository {
    return {
      listShelves: vi.fn().mockResolvedValue([]),
      findById: vi.fn().mockResolvedValue(makeShelf({ isSystem: false })),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      addBook: vi.fn(),
      rankShelfItem: vi.fn(),
      createSystemShelves: vi.fn(),
      findShelfItem: vi.fn(),
      upsertShelfItem: vi.fn().mockResolvedValue(makeShelfItem()),
      deleteShelfItem: vi.fn().mockResolvedValue(undefined),
      getMaxPosition: vi.fn().mockResolvedValue(0),
      moveShelfItem: vi.fn().mockResolvedValue(makeShelfItem()),
      listOwnersWithBookOnSystemShelf: vi.fn().mockResolvedValue([]),
      listShelfItemsByOwner: vi.fn().mockResolvedValue([]),
      ...overrides,
    };
  }
  function makeActivity(): ActivityRepository {
    return { append: vi.fn(), getFriendFeed: vi.fn(), getFriendFeedGrouped: vi.fn(), deleteByReviewId: vi.fn(), listByActor: vi.fn().mockResolvedValue([]) };
  }

  it("upsertShelfItem defaults position to maxPosition + 1 when not provided", async () => {
    const repo = makeShelfRepo({ getMaxPosition: vi.fn().mockResolvedValue(5) });
    const service = new ShelfService(repo, makeActivity());
    await service.upsertShelfItem({
      ownerId: "00000000-0000-0000-0000-000000000001",
      shelfId: "00000000-0000-0000-0000-000000000020",
      bookId: "00000000-0000-0000-0000-000000000012",
    });
    expect(repo.upsertShelfItem).toHaveBeenCalledWith(
      expect.objectContaining({ position: 6 })
    );
  });

  it("upsertShelfItem uses explicit position when provided", async () => {
    const repo = makeShelfRepo();
    const service = new ShelfService(repo, makeActivity());
    await service.upsertShelfItem({
      ownerId: "00000000-0000-0000-0000-000000000001",
      shelfId: "00000000-0000-0000-0000-000000000020",
      bookId: "00000000-0000-0000-0000-000000000012",
      position: 3,
    });
    expect(repo.upsertShelfItem).toHaveBeenCalledWith(
      expect.objectContaining({ position: 3 })
    );
  });

  it("upsertShelfItem passes notes through", async () => {
    const repo = makeShelfRepo();
    const service = new ShelfService(repo, makeActivity());
    await service.upsertShelfItem({
      ownerId: "00000000-0000-0000-0000-000000000001",
      shelfId: "00000000-0000-0000-0000-000000000020",
      bookId: "00000000-0000-0000-0000-000000000012",
      notes: "Loved this",
    });
    expect(repo.upsertShelfItem).toHaveBeenCalledWith(
      expect.objectContaining({ notes: "Loved this" })
    );
  });

  it("upsertShelfItem throws NOT_FOUND when shelf does not exist", async () => {
    const repo = makeShelfRepo({ findById: vi.fn().mockResolvedValue(null) });
    const service = new ShelfService(repo, makeActivity());
    await expect(service.upsertShelfItem({
      ownerId: "00000000-0000-0000-0000-000000000001",
      shelfId: "00000000-0000-0000-0000-000000000020",
      bookId: "00000000-0000-0000-0000-000000000012",
    })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("upsertShelfItem throws FORBIDDEN when caller is not the shelf owner", async () => {
    const repo = makeShelfRepo({
      findById: vi.fn().mockResolvedValue(makeShelf({ ownerId: "00000000-0000-0000-0000-000000000099" })),
    });
    const service = new ShelfService(repo, makeActivity());
    await expect(service.upsertShelfItem({
      ownerId: "00000000-0000-0000-0000-000000000001",
      shelfId: "00000000-0000-0000-0000-000000000020",
      bookId: "00000000-0000-0000-0000-000000000012",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("moveShelfItem delegates to repository", async () => {
    const repo = makeShelfRepo({
      findShelfItem: vi.fn().mockResolvedValue(makeShelfItem()),
    });
    const service = new ShelfService(repo, makeActivity());
    await service.moveShelfItem({
      ownerId: "00000000-0000-0000-0000-000000000001",
      shelfId: "00000000-0000-0000-0000-000000000020",
      bookId: "00000000-0000-0000-0000-000000000012",
      position: 2,
    });
    expect(repo.moveShelfItem).toHaveBeenCalledWith({
      shelfId: "00000000-0000-0000-0000-000000000020",
      bookId: "00000000-0000-0000-0000-000000000012",
      position: 2,
    });
  });

  it("moveShelfItem throws NOT_FOUND when shelf item does not exist", async () => {
    const repo = makeShelfRepo({
      findShelfItem: vi.fn().mockResolvedValue(null),
    });
    const service = new ShelfService(repo, makeActivity());
    await expect(service.moveShelfItem({
      ownerId: "00000000-0000-0000-0000-000000000001",
      shelfId: "00000000-0000-0000-0000-000000000020",
      bookId: "00000000-0000-0000-0000-000000000012",
      position: 2,
    })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("moveShelfItem throws NOT_FOUND when shelf does not exist", async () => {
    const repo = makeShelfRepo({ findById: vi.fn().mockResolvedValue(null) });
    const service = new ShelfService(repo, makeActivity());
    await expect(service.moveShelfItem({
      ownerId: "00000000-0000-0000-0000-000000000001",
      shelfId: "00000000-0000-0000-0000-000000000020",
      bookId: "00000000-0000-0000-0000-000000000012",
      position: 2,
    })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("moveShelfItem throws FORBIDDEN when caller is not the owner", async () => {
    const repo = makeShelfRepo({
      findById: vi.fn().mockResolvedValue(makeShelf({ ownerId: "00000000-0000-0000-0000-000000000099" })),
    });
    const service = new ShelfService(repo, makeActivity());
    await expect(service.moveShelfItem({
      ownerId: "00000000-0000-0000-0000-000000000001",
      shelfId: "00000000-0000-0000-0000-000000000020",
      bookId: "00000000-0000-0000-0000-000000000012",
      position: 2,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("deleteShelfItem delegates to repository", async () => {
    const repo = makeShelfRepo();
    const service = new ShelfService(repo, makeActivity());
    await service.deleteShelfItem({
      ownerId: "00000000-0000-0000-0000-000000000001",
      shelfId: "00000000-0000-0000-0000-000000000020",
      bookId: "00000000-0000-0000-0000-000000000012",
    });
    expect(repo.deleteShelfItem).toHaveBeenCalledWith({
      shelfId: "00000000-0000-0000-0000-000000000020",
      bookId: "00000000-0000-0000-0000-000000000012",
    });
  });

  it("deleteShelfItem throws NOT_FOUND when shelf does not exist", async () => {
    const repo = makeShelfRepo({ findById: vi.fn().mockResolvedValue(null) });
    const service = new ShelfService(repo, makeActivity());
    await expect(service.deleteShelfItem({
      ownerId: "00000000-0000-0000-0000-000000000001",
      shelfId: "00000000-0000-0000-0000-000000000020",
      bookId: "00000000-0000-0000-0000-000000000012",
    })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("deleteShelfItem throws FORBIDDEN when caller is not the owner", async () => {
    const repo = makeShelfRepo({
      findById: vi.fn().mockResolvedValue(makeShelf({ ownerId: "00000000-0000-0000-0000-000000000099" })),
    });
    const service = new ShelfService(repo, makeActivity());
    await expect(service.deleteShelfItem({
      ownerId: "00000000-0000-0000-0000-000000000001",
      shelfId: "00000000-0000-0000-0000-000000000020",
      bookId: "00000000-0000-0000-0000-000000000012",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
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
    return { append: vi.fn(), getFriendFeed: vi.fn(), getFriendFeedGrouped: vi.fn(), deleteByReviewId: vi.fn(), listByActor: vi.fn().mockResolvedValue([]), ...overrides };
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

  it("getScoreUnlockStatus returns unlocked=false when < 10 rankings", async () => {
    const rankings = Array.from({ length: 9 }, (_, i) =>
      ({
        id: `r-${i}`,
        profileId: "owner1",
        bookId: `book-${i}`,
        position: i + 1,
        score: 10 - i,
        bucket: 3,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Ranking)
    );
    const rankingsRepo = makeRankingsRepo({ listByOwner: vi.fn().mockResolvedValue(rankings) });
    const service = new RankingService(rankingsRepo, makeActivity());

    const status = await service.getScoreUnlockStatus("owner1");

    expect(status.unlocked).toBe(false);
    expect(status.finishedCount).toBe(9);
  });

  it("getScoreUnlockStatus returns unlocked=true when exactly 10 rankings", async () => {
    const rankings = Array.from({ length: 10 }, (_, i) =>
      ({
        id: `r-${i}`,
        profileId: "owner1",
        bookId: `book-${i}`,
        position: i + 1,
        score: 10 - i,
        bucket: 3,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Ranking)
    );
    const rankingsRepo = makeRankingsRepo({ listByOwner: vi.fn().mockResolvedValue(rankings) });
    const service = new RankingService(rankingsRepo, makeActivity());

    const status = await service.getScoreUnlockStatus("owner1");

    expect(status.unlocked).toBe(true);
    expect(status.finishedCount).toBe(10);
  });

  it("getScoreUnlockStatus returns unlocked=true when > 10 rankings", async () => {
    const rankings = Array.from({ length: 15 }, (_, i) =>
      ({
        id: `r-${i}`,
        profileId: "owner1",
        bookId: `book-${i}`,
        position: i + 1,
        score: 10 - i,
        bucket: 3,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Ranking)
    );
    const rankingsRepo = makeRankingsRepo({ listByOwner: vi.fn().mockResolvedValue(rankings) });
    const service = new RankingService(rankingsRepo, makeActivity());

    const status = await service.getScoreUnlockStatus("owner1");

    expect(status.unlocked).toBe(true);
    expect(status.finishedCount).toBe(15);
  });

  it("getScoreUnlockStatus returns unlocked=false and finishedCount=0 when no rankings", async () => {
    const rankingsRepo = makeRankingsRepo({ listByOwner: vi.fn().mockResolvedValue([]) });
    const service = new RankingService(rankingsRepo, makeActivity());

    const status = await service.getScoreUnlockStatus("owner1");

    expect(status.unlocked).toBe(false);
    expect(status.finishedCount).toBe(0);
  });

  it("listRankingsWithGate returns rankings with null scores when < 10 rankings", async () => {
    const rankings = Array.from({ length: 5 }, (_, i) =>
      ({
        id: `r-${i}`,
        profileId: "owner1",
        bookId: `book-${i}`,
        position: i + 1,
        score: 10 - i * 2,
        bucket: 3,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Ranking)
    );
    const rankingsRepo = makeRankingsRepo({ listByOwner: vi.fn().mockResolvedValue(rankings) });
    const service = new RankingService(rankingsRepo, makeActivity());

    const result = await service.listRankingsWithGate("owner1");

    expect(result).toHaveLength(5);
    for (const r of result) {
      expect(r.score).toBeNull();
    }
    // Non-score fields preserved
    expect(result[0]!.bookId).toBe("book-0");
    expect(result[0]!.position).toBe(1);
  });

  it("listRankingsWithGate returns rankings with scores when >= 10 rankings", async () => {
    const rankings = Array.from({ length: 10 }, (_, i) =>
      ({
        id: `r-${i}`,
        profileId: "owner1",
        bookId: `book-${i}`,
        position: i + 1,
        score: 10 - i,
        bucket: 3,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Ranking)
    );
    const rankingsRepo = makeRankingsRepo({ listByOwner: vi.fn().mockResolvedValue(rankings) });
    const service = new RankingService(rankingsRepo, makeActivity());

    const result = await service.listRankingsWithGate("owner1");

    expect(result).toHaveLength(10);
    for (let i = 0; i < 10; i++) {
      expect(result[i]!.score).toBe(10 - i);
    }
  });

  it("listRankingsWithGate returns empty array when no rankings", async () => {
    const rankingsRepo = makeRankingsRepo({ listByOwner: vi.fn().mockResolvedValue([]) });
    const service = new RankingService(rankingsRepo, makeActivity());

    const result = await service.listRankingsWithGate("owner1");

    expect(result).toHaveLength(0);
  });

  it("rerank throws NOT_FOUND when ranking does not exist", async () => {
    const rankingsRepo = makeRankingsRepo({ findByOwnerAndBook: vi.fn().mockResolvedValue(null) });
    const service = new RankingService(rankingsRepo, makeActivity());

    await expect(
      service.rerank({ ownerId: "owner1", bookId: "book1", version: 1, bucket: 3 })
    ).rejects.toThrow("Ranking not found");
  });

  it("rerank throws VERSION_CONFLICT when version does not match", async () => {
    const now = new Date();
    const existing: Ranking = {
      id: "r1",
      profileId: "owner1",
      bookId: "book1",
      position: 3,
      score: 7,
      bucket: 4,
      version: 2,
      createdAt: now,
      updatedAt: now,
    };
    const rankingsRepo = makeRankingsRepo({
      findByOwnerAndBook: vi.fn().mockResolvedValue(existing),
    });
    const service = new RankingService(rankingsRepo, makeActivity());

    await expect(
      service.rerank({ ownerId: "owner1", bookId: "book1", version: 1, bucket: 3 })
    ).rejects.toThrow("Version conflict");
  });

  it("rerank calls startBucket when version matches", async () => {
    const now = new Date();
    const existing: Ranking = {
      id: "r1",
      profileId: "owner1",
      bookId: "book1",
      position: 3,
      score: 7,
      bucket: 4,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    const updated: Ranking = { ...existing, bucket: 2 };
    const rankingsRepo = makeRankingsRepo({
      findByOwnerAndBook: vi.fn().mockResolvedValue(existing),
      startBucket: vi.fn().mockResolvedValue(updated),
    });
    const service = new RankingService(rankingsRepo, makeActivity());

    const result = await service.rerank({ ownerId: "owner1", bookId: "book1", version: 1, bucket: 2 });

    expect(rankingsRepo.startBucket).toHaveBeenCalledWith({
      ownerId: "owner1",
      bookId: "book1",
      bucket: 2,
    });
    expect(result.bucket).toBe(2);
  });

  it("finishRerank upserts ranking and publishes book_ranked activity event", async () => {
    const now = new Date();
    const ranking: Ranking = {
      id: "r1",
      profileId: "owner1",
      bookId: "book1",
      position: 3,
      score: 7.78,
      bucket: 4,
      version: 2,
      createdAt: now,
      updatedAt: now,
    };
    const event = {
      id: "evt-1",
      actorId: "owner1",
      verb: "book_ranked" as const,
      bookId: "book1",
      visibility: "followers" as const,
      occurredAt: now,
      scoreAtPublish: 7.78,
      scoreLockedAtPublish: false,
    };
    const rankingsRepo = makeRankingsRepo({ upsert: vi.fn().mockResolvedValue(ranking) });
    const activity = makeActivity({ append: vi.fn().mockResolvedValue(event) });
    const service = new RankingService(rankingsRepo, activity);

    const result = await service.finishRerank({
      ownerId: "owner1",
      bookId: "book1",
      position: 3,
      total: 10,
    });

    expect(rankingsRepo.upsert).toHaveBeenCalledWith({
      ownerId: "owner1",
      bookId: "book1",
      rank: 3,
      score: expect.any(Number),
    });
    expect(activity.append).toHaveBeenCalledWith(
      expect.objectContaining({
        verb: "book_ranked",
        bookId: "book1",
        scoreAtPublish: expect.any(Number),
      })
    );
    expect(result.ranking).toEqual(ranking);
    expect(result.event).toEqual(event);
  });

  it("finishRerank sets scoreLockedAtPublish=true when total < 10", async () => {
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
      verb: "book_ranked" as const,
      bookId: "book1",
      visibility: "followers" as const,
      occurredAt: now,
      scoreAtPublish: 10,
      scoreLockedAtPublish: true,
    };
    const rankingsRepo = makeRankingsRepo({ upsert: vi.fn().mockResolvedValue(ranking) });
    const activity = makeActivity({ append: vi.fn().mockResolvedValue(event) });
    const service = new RankingService(rankingsRepo, activity);

    await service.finishRerank({ ownerId: "owner1", bookId: "book1", position: 1, total: 5 });

    expect(activity.append).toHaveBeenCalledWith(
      expect.objectContaining({ scoreLockedAtPublish: true })
    );
  });
});

describe("ReviewService", () => {
  function makeReviewRepo(overrides?: Partial<ReviewRepository>): ReviewRepository {
    return { findById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), listByAuthor: vi.fn().mockResolvedValue([]), ...overrides };
  }
  function makeActivity(): ActivityRepository {
    return { append: vi.fn(), getFriendFeed: vi.fn(), getFriendFeedGrouped: vi.fn(), deleteByReviewId: vi.fn(), listByActor: vi.fn().mockResolvedValue([]) };
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

  it("deleteReview deletes the review and cascades activity event removal", async () => {
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
    const reviewRepo = makeReviewRepo({
      findById: vi.fn().mockResolvedValue(review),
      delete: vi.fn().mockResolvedValue(undefined),
    });
    const activity = makeActivity();
    (activity.deleteByReviewId as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const service = new ReviewService(reviewRepo, activity);
    await service.deleteReview({ id: review.id, authorId: review.authorId });

    expect(activity.deleteByReviewId).toHaveBeenCalledWith(review.id);
    expect(reviewRepo.delete).toHaveBeenCalledWith({ id: review.id, authorId: review.authorId });
  });

  it("deleteReview throws NOT_FOUND when review does not exist", async () => {
    const reviewRepo = makeReviewRepo({ findById: vi.fn().mockResolvedValue(null) });
    const activity = makeActivity();

    const service = new ReviewService(reviewRepo, activity);
    await expect(
      service.deleteReview({ id: "00000000-0000-0000-0000-000000000001", authorId: "00000000-0000-0000-0000-000000000002" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("deleteReview throws FORBIDDEN when caller is not the author", async () => {
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
    const reviewRepo = makeReviewRepo({ findById: vi.fn().mockResolvedValue(review) });
    const activity = makeActivity();

    const service = new ReviewService(reviewRepo, activity);
    await expect(
      service.deleteReview({ id: review.id, authorId: "00000000-0000-0000-0000-000000000099" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("deleteReview does not delete the review or activity events when authz fails", async () => {
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
    const reviewRepo = makeReviewRepo({
      findById: vi.fn().mockResolvedValue(review),
      delete: vi.fn(),
    });
    const activity = makeActivity();

    const service = new ReviewService(reviewRepo, activity);
    await expect(
      service.deleteReview({ id: review.id, authorId: "00000000-0000-0000-0000-000000000099" })
    ).rejects.toThrow();

    expect(activity.deleteByReviewId).not.toHaveBeenCalled();
    expect(reviewRepo.delete).not.toHaveBeenCalled();
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

  it("createBlock creates a block and calls unfollow in both directions", async () => {
    const block = makeBlock("blocker", "blocked");
    const blockRepo = makeBlockRepo([], []);
    blockRepo.findBlock = vi.fn().mockResolvedValue(null);
    blockRepo.block = vi.fn().mockResolvedValue(block);
    const followRepo: FollowRepository = {
      follow: vi.fn(),
      unfollow: vi.fn().mockResolvedValue(undefined),
      findFollow: vi.fn(),
      listFollowers: vi.fn().mockResolvedValue([]),
      listFollowing: vi.fn().mockResolvedValue([]),
      isMutual: vi.fn(),
      countMutuals: vi.fn().mockResolvedValue(0),
      listMutualIds: vi.fn().mockResolvedValue([]),
      listFriendsOfFriends: vi.fn().mockResolvedValue([]),
    };
    const service = new BlockService(blockRepo, followRepo);
    const result = await service.createBlock({ blockerId: "blocker", blockedId: "blocked" });
    expect(result).toEqual(block);
    expect(followRepo.unfollow).toHaveBeenCalledWith({ followerId: "blocker", followeeId: "blocked" });
    expect(followRepo.unfollow).toHaveBeenCalledWith({ followerId: "blocked", followeeId: "blocker" });
    expect(blockRepo.block).toHaveBeenCalled();
  });

  it("createBlock is idempotent - returns existing block without unfollowing", async () => {
    const existingBlock = makeBlock("blocker", "blocked");
    const blockRepo = makeBlockRepo([], []);
    blockRepo.findBlock = vi.fn().mockResolvedValue(existingBlock);
    blockRepo.block = vi.fn();
    const followRepo: FollowRepository = {
      follow: vi.fn(),
      unfollow: vi.fn(),
      findFollow: vi.fn(),
      listFollowers: vi.fn().mockResolvedValue([]),
      listFollowing: vi.fn().mockResolvedValue([]),
      isMutual: vi.fn(),
      countMutuals: vi.fn().mockResolvedValue(0),
      listMutualIds: vi.fn().mockResolvedValue([]),
      listFriendsOfFriends: vi.fn().mockResolvedValue([]),
    };
    const service = new BlockService(blockRepo, followRepo);
    const result = await service.createBlock({ blockerId: "blocker", blockedId: "blocked" });
    expect(result).toEqual(existingBlock);
    expect(blockRepo.block).not.toHaveBeenCalled();
    expect(followRepo.unfollow).not.toHaveBeenCalled();
  });

  it("createBlock throws BAD_REQUEST when blocking yourself", async () => {
    const blockRepo = makeBlockRepo([], []);
    const service = new BlockService(blockRepo);
    await expect(
      service.createBlock({ blockerId: "user1", blockedId: "user1" })
    ).rejects.toThrow("Cannot block yourself");
  });

  it("deleteBlock removes existing block without restoring follows", async () => {
    const existingBlock = makeBlock("blocker", "blocked");
    const blockRepo = makeBlockRepo([], []);
    blockRepo.findBlock = vi.fn().mockResolvedValue(existingBlock);
    blockRepo.unblock = vi.fn().mockResolvedValue(undefined);
    const followRepo: FollowRepository = {
      follow: vi.fn(),
      unfollow: vi.fn(),
      findFollow: vi.fn(),
      listFollowers: vi.fn().mockResolvedValue([]),
      listFollowing: vi.fn().mockResolvedValue([]),
      isMutual: vi.fn(),
      countMutuals: vi.fn().mockResolvedValue(0),
      listMutualIds: vi.fn().mockResolvedValue([]),
      listFriendsOfFriends: vi.fn().mockResolvedValue([]),
    };
    const service = new BlockService(blockRepo, followRepo);
    await service.deleteBlock({ blockerId: "blocker", blockedId: "blocked" });
    expect(blockRepo.unblock).toHaveBeenCalledWith({ blockerId: "blocker", blockedId: "blocked" });
    // No auto-restore of follows
    expect(followRepo.follow).not.toHaveBeenCalled();
  });

  it("deleteBlock is idempotent - succeeds when not blocked", async () => {
    const blockRepo = makeBlockRepo([], []);
    blockRepo.findBlock = vi.fn().mockResolvedValue(null);
    blockRepo.unblock = vi.fn();
    const service = new BlockService(blockRepo);
    await service.deleteBlock({ blockerId: "blocker", blockedId: "blocked" });
    expect(blockRepo.unblock).not.toHaveBeenCalled();
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
      isMutual: vi.fn(), countMutuals: vi.fn().mockResolvedValue(0),
      listMutualIds: vi.fn().mockResolvedValue([]),
      listFriendsOfFriends: vi.fn().mockResolvedValue([]),
    };
  }

  function makeContactsRepo(matches: string[] = []): ContactsRepository {
    return {
      upsertHashes: vi.fn(),
      findMatches: vi.fn().mockResolvedValue(matches),
      findMatchingProfilesByPhone: vi.fn().mockResolvedValue([]),
      deleteForUser: vi.fn(),
      deleteExpired: vi.fn(),
      expireBySaltVersion: vi.fn(),
      deleteByTargetHash: vi.fn(),
      listByUser: vi.fn(),
      softDisable: vi.fn(),
      purgeOlderThan: vi.fn().mockResolvedValue(0),
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
      getFriendFeedGrouped: vi.fn().mockResolvedValue(feedItems),
      deleteByReviewId: vi.fn(),
      listByActor: vi.fn().mockResolvedValue([]),
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
      isMutual: vi.fn().mockResolvedValue(false), countMutuals: vi.fn().mockResolvedValue(0),
      listMutualIds: vi.fn().mockResolvedValue([]),
      listFriendsOfFriends: vi.fn().mockResolvedValue([]),
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

describe("computeGroupKey", () => {
  const actorId = "00000000-0000-0000-0000-000000000001";

  it("returns a deterministic key for same actor, verb, and 30-min bucket", () => {
    const t1 = new Date("2024-06-01T10:00:00Z");
    const t2 = new Date("2024-06-01T10:15:00Z"); // same 30-min window

    const key1 = computeGroupKey(actorId, "book_added", t1);
    const key2 = computeGroupKey(actorId, "book_added", t2);

    expect(key1).toBe(key2);
  });

  it("produces different keys for events in different 30-min windows", () => {
    const t1 = new Date("2024-06-01T10:00:00Z");
    const t2 = new Date("2024-06-01T10:31:00Z"); // next 30-min window

    const key1 = computeGroupKey(actorId, "book_added", t1);
    const key2 = computeGroupKey(actorId, "book_added", t2);

    expect(key1).not.toBe(key2);
  });

  it("produces different keys for different verbs within the same window", () => {
    const t = new Date("2024-06-01T10:05:00Z");

    const key1 = computeGroupKey(actorId, "book_added", t);
    const key2 = computeGroupKey(actorId, "book_reviewed", t);

    expect(key1).not.toBe(key2);
  });

  it("produces different keys for different actors within the same window", () => {
    const t = new Date("2024-06-01T10:05:00Z");
    const actor2 = "00000000-0000-0000-0000-000000000002";

    const key1 = computeGroupKey(actorId, "book_added", t);
    const key2 = computeGroupKey(actor2, "book_added", t);

    expect(key1).not.toBe(key2);
  });

  it("key format includes actor, verb, and bucket", () => {
    const t = new Date("2024-06-01T10:00:00Z");
    const key = computeGroupKey(actorId, "book_added", t);

    expect(key).toContain(actorId);
    expect(key).toContain("book_added");
    // Should be actor:verb:bucket format
    const parts = key.split(":");
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe(actorId);
    expect(parts[1]).toBe("book_added");
    expect(Number(parts[2])).not.toBeNaN();
  });

  it("boundary: event at exact 30-min mark belongs to the next bucket", () => {
    // 30 minutes in ms = 1_800_000
    // An event at exactly t=1_800_000ms should be in bucket 1
    const t = new Date(30 * 60 * 1000); // exactly 30 min from epoch
    const key = computeGroupKey(actorId, "book_added", t);
    const parts = key.split(":");
    expect(parts[2]).toBe("1");
  });
});

describe("MagicLinkService", () => {
  function makeMagicLinkRepository(): MagicLinkRepository {
    return {
      create: vi.fn().mockResolvedValue({
        email: "user@example.com",
        tokenHash: "hashed-token",
        expiresAt: new Date(Date.now() + 600000),
      }),
      findByTokenHash: vi.fn(),
      markConsumed: vi.fn(),
      deleteExpiredForEmail: vi.fn(),
    };
  }

  function makeAuthIdentityRepo(): AuthIdentityRepository {
    return {
      create: vi.fn().mockImplementation(async (input) => ({
        provider: input.provider,
        providerUserId: input.providerUserId,
        profileId: input.profileId,
      })),
      findByProvider: vi.fn().mockResolvedValue(null),
      listByProfile: vi.fn().mockResolvedValue([]),
    };
  }

  function makeSessionRepo(): SessionRepository {
    return {
      create: vi.fn().mockImplementation(async (input) => ({
        tokenHash: input.tokenHash,
        profileId: input.profileId,
        expiresAt: input.expiresAt,
      })),
      findByTokenHash: vi.fn(),
      revokeByTokenHash: vi.fn(),
      revokeAllForProfile: vi.fn(),
    };
  }

  function makeEmailProvider(): EmailProvider {
    return {
      sendMagicLink: vi.fn().mockResolvedValue(undefined),
    };
  }

  it("requestMagicLink normalizes email, cleans expired tokens, creates token, and sends email", async () => {
    const magicLinks = makeMagicLinkRepository();
    const authIdentities = makeAuthIdentityRepo();
    const sessions = makeSessionRepo();
    const emailProvider = makeEmailProvider();

    const service = new MagicLinkService(magicLinks, authIdentities, sessions, emailProvider);
    const result = await service.requestMagicLink("  User@Example.COM  ");

    expect(magicLinks.deleteExpiredForEmail).toHaveBeenCalledWith("user@example.com");
    expect(magicLinks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "user@example.com",
      })
    );
    expect(emailProvider.sendMagicLink).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "user@example.com",
        expiresInMinutes: 10,
      })
    );
    expect(result.expiresAt).toBeInstanceOf(Date);
  });

  it("requestMagicLink stores hashed token, not raw token", async () => {
    const magicLinks = makeMagicLinkRepository();
    const authIdentities = makeAuthIdentityRepo();
    const sessions = makeSessionRepo();
    const emailProvider = makeEmailProvider();

    const service = new MagicLinkService(magicLinks, authIdentities, sessions, emailProvider);
    await service.requestMagicLink("user@example.com");

    const createCall = (magicLinks.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    // tokenHash should be a hex string (64 chars for SHA-256)
    expect(createCall.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    // The raw token sent to email should be different from the stored hash
    const emailCall = (emailProvider.sendMagicLink as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(emailCall.token).not.toBe(createCall.tokenHash);
  });

  it("consumeMagicLink throws INVALID_TOKEN when token not found", async () => {
    const magicLinks = makeMagicLinkRepository();
    (magicLinks.findByTokenHash as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const authIdentities = makeAuthIdentityRepo();
    const sessions = makeSessionRepo();
    const emailProvider = makeEmailProvider();

    const service = new MagicLinkService(magicLinks, authIdentities, sessions, emailProvider);

    await expect(service.consumeMagicLink("invalid-token")).rejects.toMatchObject({
      code: "INVALID_TOKEN",
    });
  });

  it("consumeMagicLink throws TOKEN_CONSUMED when token already used", async () => {
    const magicLinks = makeMagicLinkRepository();
    (magicLinks.findByTokenHash as ReturnType<typeof vi.fn>).mockResolvedValue({
      email: "user@example.com",
      tokenHash: "hashed",
      expiresAt: new Date(Date.now() + 600000),
      consumedAt: new Date(),
    });
    const authIdentities = makeAuthIdentityRepo();
    const sessions = makeSessionRepo();
    const emailProvider = makeEmailProvider();

    const service = new MagicLinkService(magicLinks, authIdentities, sessions, emailProvider);

    await expect(service.consumeMagicLink("some-token")).rejects.toMatchObject({
      code: "TOKEN_CONSUMED",
    });
  });

  it("consumeMagicLink throws TOKEN_EXPIRED when token expired", async () => {
    const magicLinks = makeMagicLinkRepository();
    (magicLinks.findByTokenHash as ReturnType<typeof vi.fn>).mockResolvedValue({
      email: "user@example.com",
      tokenHash: "hashed",
      expiresAt: new Date(Date.now() - 1000),
      consumedAt: undefined,
    });
    const authIdentities = makeAuthIdentityRepo();
    const sessions = makeSessionRepo();
    const emailProvider = makeEmailProvider();

    const service = new MagicLinkService(magicLinks, authIdentities, sessions, emailProvider);

    await expect(service.consumeMagicLink("some-token")).rejects.toMatchObject({
      code: "TOKEN_EXPIRED",
    });
  });

  it("consumeMagicLink marks token consumed, creates new identity, and returns session for new user", async () => {
    const magicLinks = makeMagicLinkRepository();
    (magicLinks.findByTokenHash as ReturnType<typeof vi.fn>).mockResolvedValue({
      email: "newuser@example.com",
      tokenHash: "hashed",
      expiresAt: new Date(Date.now() + 600000),
      consumedAt: undefined,
    });
    const authIdentities = makeAuthIdentityRepo();
    (authIdentities.findByProvider as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const sessions = makeSessionRepo();
    const emailProvider = makeEmailProvider();

    const service = new MagicLinkService(magicLinks, authIdentities, sessions, emailProvider);
    const result = await service.consumeMagicLink("raw-token");

    expect(magicLinks.markConsumed).toHaveBeenCalled();
    expect(authIdentities.findByProvider).toHaveBeenCalledWith({
      provider: "email",
      providerUserId: "newuser@example.com",
    });
    expect(authIdentities.create).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "email",
        providerUserId: "newuser@example.com",
      })
    );
    expect(sessions.create).toHaveBeenCalled();
    expect(result.sessionToken).toBeDefined();
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(result.isNewUser).toBe(true);
  });

  it("consumeMagicLink returns existing user session when identity exists", async () => {
    const magicLinks = makeMagicLinkRepository();
    (magicLinks.findByTokenHash as ReturnType<typeof vi.fn>).mockResolvedValue({
      email: "existing@example.com",
      tokenHash: "hashed",
      expiresAt: new Date(Date.now() + 600000),
      consumedAt: undefined,
    });
    const authIdentities = makeAuthIdentityRepo();
    (authIdentities.findByProvider as ReturnType<typeof vi.fn>).mockResolvedValue({
      provider: "email",
      providerUserId: "existing@example.com",
      profileId: "00000000-0000-0000-0000-000000000001",
    });
    const sessions = makeSessionRepo();
    const emailProvider = makeEmailProvider();

    const service = new MagicLinkService(magicLinks, authIdentities, sessions, emailProvider);
    const result = await service.consumeMagicLink("raw-token");

    expect(authIdentities.create).not.toHaveBeenCalled();
    expect(result.isNewUser).toBe(false);
    expect(result.sessionToken).toBeDefined();
  });
});

describe("FollowService.getMutualCount", () => {
  const UUID1 = "00000000-0000-0000-0000-000000000001";

  function makeFollowRepo(overrides?: Partial<FollowRepository>): FollowRepository {
    return {
      follow: vi.fn(),
      unfollow: vi.fn(),
      findFollow: vi.fn(),
      listFollowers: vi.fn().mockResolvedValue([]),
      listFollowing: vi.fn().mockResolvedValue([]),
      isMutual: vi.fn().mockResolvedValue(false),
      countMutuals: vi.fn().mockResolvedValue(0),
      listMutualIds: vi.fn().mockResolvedValue([]),
      listFriendsOfFriends: vi.fn().mockResolvedValue([]),
      ...overrides,
    };
  }

  function makeBlockRepoLocal(): BlockRepository {
    return {
      block: vi.fn(),
      unblock: vi.fn(),
      findBlock: vi.fn().mockResolvedValue(null),
      listBlockedByUser: vi.fn().mockResolvedValue([]),
      listBlockingUser: vi.fn().mockResolvedValue([]),
      isBlocked: vi.fn().mockResolvedValue(false),
    };
  }

  it("returns the count from the repository", async () => {
    const followRepo = makeFollowRepo({ countMutuals: vi.fn().mockResolvedValue(5) });
    const service = new FollowService(followRepo, makeBlockRepoLocal());

    const result = await service.getMutualCount(UUID1);

    expect(followRepo.countMutuals).toHaveBeenCalledWith(UUID1);
    expect(result).toBe(5);
  });

  it("returns 0 when user has no mutuals", async () => {
    const followRepo = makeFollowRepo({ countMutuals: vi.fn().mockResolvedValue(0) });
    const service = new FollowService(followRepo, makeBlockRepoLocal());

    const result = await service.getMutualCount(UUID1);

    expect(result).toBe(0);
  });
});

describe("NotificationService", () => {
  function makeInAppNotificationRepo(overrides?: Partial<InAppNotificationRepository>): InAppNotificationRepository {
    return {
      list: vi.fn().mockResolvedValue([]),
      markRead: vi.fn().mockResolvedValue(undefined),
      findById: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      countSince: vi.fn().mockResolvedValue(0),
      countSinceByActor: vi.fn().mockResolvedValue(0),
      listAllByRecipient: vi.fn().mockResolvedValue([]),
      ...overrides,
    };
  }

  it("list delegates to repository", async () => {
    const notification: InAppNotification = {
      id: "00000000-0000-0000-0000-000000000001",
      recipientId: "00000000-0000-0000-0000-000000000002",
      actorId: "00000000-0000-0000-0000-000000000003",
      trigger: "new_follower",
      payload: {},
      createdAt: new Date(),
    };
    const repo = makeInAppNotificationRepo({
      list: vi.fn().mockResolvedValue([notification]),
    });
    const service = new NotificationService(repo);
    const result = await service.list({
      recipientId: "00000000-0000-0000-0000-000000000002",
      limit: 20,
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(notification);
    expect(repo.list).toHaveBeenCalledWith({
      recipientId: "00000000-0000-0000-0000-000000000002",
      limit: 20,
    });
  });

  it("markRead delegates to repository (idempotent)", async () => {
    const repo = makeInAppNotificationRepo();
    const service = new NotificationService(repo);
    await service.markRead({
      recipientId: "00000000-0000-0000-0000-000000000002",
      notificationId: "00000000-0000-0000-0000-000000000001",
    });
    expect(repo.markRead).toHaveBeenCalledWith({
      recipientId: "00000000-0000-0000-0000-000000000002",
      notificationId: "00000000-0000-0000-0000-000000000001",
    });
  });

  it("markRead calling twice does not throw", async () => {
    const repo = makeInAppNotificationRepo();
    const service = new NotificationService(repo);
    const input = {
      recipientId: "00000000-0000-0000-0000-000000000002",
      notificationId: "00000000-0000-0000-0000-000000000001",
    };
    await service.markRead(input);
    await service.markRead(input);
    expect(repo.markRead).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// NotificationService — settings CRUD + caps (#147 [Q-03])
// ---------------------------------------------------------------------------

import {
  DEFAULT_NOTIFICATION_SETTINGS,
  NOTIFICATION_CAP_PER_ACTOR_DAY,
  NOTIFICATION_CAP_PER_RECIPIENT_DAY,
  NOTIFICATION_SETTINGS_KEY,
} from "./schemas/notifications";
import type { NotificationRepository } from "./ports";

function makeNotificationRepo(): NotificationRepository {
  const store = new Map<string, unknown>();
  return {
    registerToken: vi.fn(),
    removeToken: vi.fn(),
    listTokensForProfile: vi.fn(),
    getSetting: vi.fn(async ({ profileId, key }) => {
      const v = store.get(`${profileId}::${key}`);
      return v === undefined ? null : { profileId, key, value: v };
    }),
    setSetting: vi.fn(async ({ profileId, key, value }) => {
      store.set(`${profileId}::${key}`, value);
      return { profileId, key, value };
    }),
    listSettings: vi.fn(),
  };
}

function makeInAppRepoWithCounts(
  recipientCount: number,
  actorCount: number,
): InAppNotificationRepository {
  return {
    list: vi.fn().mockResolvedValue([]),
    markRead: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation(async ({ recipientId, actorId, trigger, payload }) => ({
      id: "00000000-0000-0000-0000-00000000c001",
      recipientId,
      ...(actorId ? { actorId } : {}),
      trigger,
      payload,
      createdAt: new Date(),
    })),
    countSince: vi.fn().mockResolvedValue(recipientCount),
    countSinceByActor: vi.fn().mockResolvedValue(actorCount),
    listAllByRecipient: vi.fn().mockResolvedValue([]),
  };
}

const VIEWER = "00000000-0000-0000-0000-0000000000a1";
const ACTOR = "00000000-0000-0000-0000-0000000000a2";
const NOW = new Date("2026-05-13T12:00:00Z"); // 12:00 UTC

describe("NotificationService.getSettings", () => {
  it("returns DEFAULT_NOTIFICATION_SETTINGS when nothing is persisted", async () => {
    const inApp = makeInAppRepoWithCounts(0, 0);
    const notif = makeNotificationRepo();
    const service = new NotificationService(inApp, notif);
    const settings = await service.getSettings(VIEWER);
    expect(settings).toEqual(DEFAULT_NOTIFICATION_SETTINGS);
  });

  it("merges persisted partial blob over defaults", async () => {
    const inApp = makeInAppRepoWithCounts(0, 0);
    const notif = makeNotificationRepo();
    await notif.setSetting({
      profileId: VIEWER,
      key: NOTIFICATION_SETTINGS_KEY,
      value: { masterEnabled: false, triggers: { new_follower: false } },
    });
    const service = new NotificationService(inApp, notif);
    const settings = await service.getSettings(VIEWER);
    expect(settings.masterEnabled).toBe(false);
    expect(settings.triggers.new_follower).toBe(false);
    expect(settings.triggers.security_event).toBe(true); // untouched
    expect(settings.channels.push).toBe(true); // untouched
  });

  it("falls back to defaults when persisted value is junk", async () => {
    const inApp = makeInAppRepoWithCounts(0, 0);
    const notif = makeNotificationRepo();
    await notif.setSetting({
      profileId: VIEWER,
      key: NOTIFICATION_SETTINGS_KEY,
      value: "not an object",
    });
    const service = new NotificationService(inApp, notif);
    const settings = await service.getSettings(VIEWER);
    expect(settings).toEqual(DEFAULT_NOTIFICATION_SETTINGS);
  });
});

describe("NotificationService.updateSettings", () => {
  it("persists a partial update and returns the merged result", async () => {
    const inApp = makeInAppRepoWithCounts(0, 0);
    const notif = makeNotificationRepo();
    const service = new NotificationService(inApp, notif);
    const result = await service.updateSettings(VIEWER, {
      masterEnabled: false,
      quietHours: { enabled: true, startMinute: 60 },
    });
    expect(result.masterEnabled).toBe(false);
    expect(result.quietHours.enabled).toBe(true);
    expect(result.quietHours.startMinute).toBe(60);
    expect(result.quietHours.endMinute).toBe(DEFAULT_NOTIFICATION_SETTINGS.quietHours.endMinute);

    // Re-read and verify durability
    const reread = await service.getSettings(VIEWER);
    expect(reread).toEqual(result);
  });

  it("ignores unknown fields and preserves valid persisted state", async () => {
    const inApp = makeInAppRepoWithCounts(0, 0);
    const notif = makeNotificationRepo();
    const service = new NotificationService(inApp, notif);
    await service.updateSettings(VIEWER, { channels: { push: false } });
    const result = await service.updateSettings(VIEWER, {
      // bogus extra keys allowed in input but not propagated to storage
    } as never);
    expect(result.channels.push).toBe(false);
    expect(result.channels.in_app).toBe(true);
  });

  it("throws if notifications repository is not configured", async () => {
    const inApp = makeInAppRepoWithCounts(0, 0);
    const service = new NotificationService(inApp);
    await expect(service.updateSettings(VIEWER, { masterEnabled: false })).rejects.toThrow(
      /requires NotificationRepository/,
    );
  });
});

describe("NotificationService.canSend", () => {
  it("allows by default when settings are unset and caps not exceeded", async () => {
    const inApp = makeInAppRepoWithCounts(0, 0);
    const notif = makeNotificationRepo();
    const service = new NotificationService(inApp, notif);
    const result = await service.canSend({
      recipientId: VIEWER,
      actorId: ACTOR,
      trigger: "new_follower",
      channel: "push",
      now: NOW,
    });
    expect(result).toEqual({ allowed: true });
  });

  it("blocks when master is paused", async () => {
    const inApp = makeInAppRepoWithCounts(0, 0);
    const notif = makeNotificationRepo();
    const service = new NotificationService(inApp, notif);
    await service.updateSettings(VIEWER, { masterEnabled: false });
    const result = await service.canSend({
      recipientId: VIEWER,
      trigger: "new_follower",
      channel: "push",
      now: NOW,
    });
    expect(result).toEqual({ allowed: false, reason: "master_paused" });
  });

  it("blocks when channel is disabled", async () => {
    const inApp = makeInAppRepoWithCounts(0, 0);
    const notif = makeNotificationRepo();
    const service = new NotificationService(inApp, notif);
    await service.updateSettings(VIEWER, { channels: { push: false } });
    const result = await service.canSend({
      recipientId: VIEWER,
      trigger: "new_follower",
      channel: "push",
      now: NOW,
    });
    expect(result).toEqual({ allowed: false, reason: "channel_disabled" });
  });

  it("blocks when trigger is disabled", async () => {
    const inApp = makeInAppRepoWithCounts(0, 0);
    const notif = makeNotificationRepo();
    const service = new NotificationService(inApp, notif);
    await service.updateSettings(VIEWER, { triggers: { new_follower: false } });
    const result = await service.canSend({
      recipientId: VIEWER,
      trigger: "new_follower",
      channel: "push",
      now: NOW,
    });
    expect(result).toEqual({ allowed: false, reason: "trigger_disabled" });
  });

  it("blocks during quiet hours", async () => {
    const inApp = makeInAppRepoWithCounts(0, 0);
    const notif = makeNotificationRepo();
    const service = new NotificationService(inApp, notif);
    // 11:00–13:00 UTC quiet, NOW=12:00 UTC
    await service.updateSettings(VIEWER, {
      quietHours: { enabled: true, startMinute: 11 * 60, endMinute: 13 * 60 },
    });
    const result = await service.canSend({
      recipientId: VIEWER,
      trigger: "new_follower",
      channel: "push",
      now: NOW,
    });
    expect(result).toEqual({ allowed: false, reason: "quiet_hours" });
  });

  it("treats quiet hours wrapping midnight correctly", async () => {
    const inApp = makeInAppRepoWithCounts(0, 0);
    const notif = makeNotificationRepo();
    const service = new NotificationService(inApp, notif);
    // 22:00–08:00 UTC quiet
    await service.updateSettings(VIEWER, {
      quietHours: { enabled: true, startMinute: 22 * 60, endMinute: 8 * 60 },
    });
    const at3am = new Date("2026-05-13T03:00:00Z");
    const result3am = await service.canSend({
      recipientId: VIEWER,
      trigger: "new_follower",
      channel: "push",
      now: at3am,
    });
    expect(result3am).toEqual({ allowed: false, reason: "quiet_hours" });

    const at10am = new Date("2026-05-13T10:00:00Z");
    const result10am = await service.canSend({
      recipientId: VIEWER,
      trigger: "new_follower",
      channel: "push",
      now: at10am,
    });
    expect(result10am).toEqual({ allowed: true });
  });

  it(`enforces recipient cap of ${NOTIFICATION_CAP_PER_RECIPIENT_DAY}/day`, async () => {
    const inApp = makeInAppRepoWithCounts(NOTIFICATION_CAP_PER_RECIPIENT_DAY, 0);
    const notif = makeNotificationRepo();
    const service = new NotificationService(inApp, notif);
    const result = await service.canSend({
      recipientId: VIEWER,
      actorId: ACTOR,
      trigger: "new_follower",
      channel: "push",
      now: NOW,
    });
    expect(result).toEqual({ allowed: false, reason: "recipient_cap" });
  });

  it(`enforces per-actor cap of ${NOTIFICATION_CAP_PER_ACTOR_DAY}/day`, async () => {
    const inApp = makeInAppRepoWithCounts(0, NOTIFICATION_CAP_PER_ACTOR_DAY);
    const notif = makeNotificationRepo();
    const service = new NotificationService(inApp, notif);
    const result = await service.canSend({
      recipientId: VIEWER,
      actorId: ACTOR,
      trigger: "new_follower",
      channel: "push",
      now: NOW,
    });
    expect(result).toEqual({ allowed: false, reason: "actor_cap" });
  });

  it("does not check per-actor cap when no actorId is supplied", async () => {
    const inApp = makeInAppRepoWithCounts(0, NOTIFICATION_CAP_PER_ACTOR_DAY);
    const notif = makeNotificationRepo();
    const service = new NotificationService(inApp, notif);
    const result = await service.canSend({
      recipientId: VIEWER,
      trigger: "new_follower",
      channel: "push",
      now: NOW,
    });
    expect(result).toEqual({ allowed: true });
    expect(inApp.countSinceByActor).not.toHaveBeenCalled();
  });

  it("security_event bypasses master-pause, trigger toggle, and quiet hours (still respects caps)", async () => {
    const inApp = makeInAppRepoWithCounts(0, 0);
    const notif = makeNotificationRepo();
    const service = new NotificationService(inApp, notif);
    await service.updateSettings(VIEWER, {
      masterEnabled: false,
      triggers: { security_event: false },
      quietHours: { enabled: true, startMinute: 11 * 60, endMinute: 13 * 60 },
    });
    const allowed = await service.canSend({
      recipientId: VIEWER,
      trigger: "security_event",
      channel: "push",
      now: NOW,
    });
    expect(allowed).toEqual({ allowed: true });

    const cappedInApp = makeInAppRepoWithCounts(NOTIFICATION_CAP_PER_RECIPIENT_DAY, 0);
    const cappedService = new NotificationService(cappedInApp, makeNotificationRepo());
    const capped = await cappedService.canSend({
      recipientId: VIEWER,
      trigger: "security_event",
      channel: "push",
      now: NOW,
    });
    expect(capped).toEqual({ allowed: false, reason: "recipient_cap" });
  });
});

describe("AppServices includes notifications", () => {
  it("exposes notifications service", () => {
    const repositories: AppRepositories = {
      accountDeletions: { create: vi.fn(), findByProfileId: vi.fn().mockResolvedValue(null), delete: vi.fn(), listExpired: vi.fn().mockResolvedValue([]), purgeProfile: vi.fn() },
    deletedProfileTombstones: { create: vi.fn(), findByHandle: vi.fn().mockResolvedValue(null), purgeExpired: vi.fn().mockResolvedValue(0) },
      profiles: { findById: vi.fn(), findByHandle: vi.fn(), create: vi.fn(), isHandleTaken: vi.fn(), setHandle: vi.fn() },
      books: { findBookById: vi.fn(), findEditionByIsbn: vi.fn(), findBookByIsbn13: vi.fn().mockResolvedValue(null), search: vi.fn(), upsertFromCatalogResult: vi.fn(), createManual: vi.fn() },
      shelves: { listShelves: vi.fn(), findById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), addBook: vi.fn(), rankShelfItem: vi.fn(), createSystemShelves: vi.fn(), findShelfItem: vi.fn(), upsertShelfItem: vi.fn(), deleteShelfItem: vi.fn(), getMaxPosition: vi.fn().mockResolvedValue(0), moveShelfItem: vi.fn(), listOwnersWithBookOnSystemShelf: vi.fn().mockResolvedValue([]), listShelfItemsByOwner: vi.fn().mockResolvedValue([]) },
      reviews: { findById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), listByAuthor: vi.fn().mockResolvedValue([]) },
      activity: { append: vi.fn(), getFriendFeed: vi.fn(), getFriendFeedGrouped: vi.fn(), deleteByReviewId: vi.fn(), listByActor: vi.fn().mockResolvedValue([]) },
      recommendations: { getForUser: vi.fn() },
      follows: { follow: vi.fn(), unfollow: vi.fn(), findFollow: vi.fn(), listFollowers: vi.fn(), listFollowing: vi.fn(), isMutual: vi.fn(), countMutuals: vi.fn().mockResolvedValue(0), listMutualIds: vi.fn().mockResolvedValue([]),
      listFriendsOfFriends: vi.fn().mockResolvedValue([]) },
      blocks: { block: vi.fn(), unblock: vi.fn(), findBlock: vi.fn(), listBlockedByUser: vi.fn(), listBlockingUser: vi.fn(), isBlocked: vi.fn() },
      rankings: { upsert: vi.fn(), findById: vi.fn(), findByOwnerAndBook: vi.fn(), listByOwner: vi.fn(), delete: vi.fn(), startBucket: vi.fn() },
      notifications: { registerToken: vi.fn(), removeToken: vi.fn(), listTokensForProfile: vi.fn(), getSetting: vi.fn(), setSetting: vi.fn(), listSettings: vi.fn() },
      imports: { create: vi.fn(), findById: vi.fn(), findByOwnerAndHash: vi.fn(), listByOwner: vi.fn(), updateStatus: vi.fn() },
      contacts: { upsertHashes: vi.fn(), findMatches: vi.fn(), findMatchingProfilesByPhone: vi.fn(), deleteForUser: vi.fn(), deleteExpired: vi.fn(), listByUser: vi.fn(), expireBySaltVersion: vi.fn(), deleteByTargetHash: vi.fn(), softDisable: vi.fn(), purgeOlderThan: vi.fn().mockResolvedValue(0) },
      emailIndex: { upsertHashes: vi.fn(), findMatches: vi.fn(), deleteForUser: vi.fn(), deleteExpired: vi.fn(), listByUser: vi.fn(), expireBySaltVersion: vi.fn(), deleteByTargetHash: vi.fn() },
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
    const auth: AuthProvider = {
      getCurrentIdentity: vi.fn().mockResolvedValue(null),
    };

    const services = new AppServices(repositories, auth);
    expect(services.notifications).toBeInstanceOf(NotificationService);
  });
});


describe("SessionService", () => {
  function makeSessionRepo() {
    return {
      create: vi.fn().mockImplementation(async (input: { tokenHash: string; profileId: string; expiresAt: Date }) => ({
        tokenHash: input.tokenHash,
        profileId: input.profileId,
        expiresAt: input.expiresAt,
      })),
      findByTokenHash: vi.fn(),
      revokeByTokenHash: vi.fn(),
      revokeAllForProfile: vi.fn(),
    } as SessionRepository;
  }

  describe("create", () => {
    it("generates an opaque token, stores sha256 hash, returns raw token", async () => {
      const sessionRepo = makeSessionRepo();
      const service = new SessionService(sessionRepo);
      const profileId = "00000000-0000-0000-0000-000000000001";

      const result = await service.create(profileId);

      expect(result.sessionToken).toBeDefined();
      expect(result.sessionToken.length).toBe(64); // 32 bytes hex
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());

      // Verify the repo received a sha256 hash, not the raw token
      expect(sessionRepo.create).toHaveBeenCalledOnce();
      const call = (sessionRepo.create as ReturnType<typeof vi.fn>).mock.calls[0]![0] as { tokenHash: string; profileId: string; expiresAt: Date };
      expect(call.tokenHash).not.toBe(result.sessionToken);
      expect(call.tokenHash.length).toBe(64); // sha256 hex
      expect(call.profileId).toBe(profileId);
    });

    it("stored hash matches sha256 of the returned raw token", async () => {
      const { createHash } = await import("node:crypto");
      const sessionRepo = makeSessionRepo();
      const service = new SessionService(sessionRepo);

      const result = await service.create("00000000-0000-0000-0000-000000000001");

      const expectedHash = createHash("sha256").update(result.sessionToken, "utf8").digest("hex");
      const call = (sessionRepo.create as ReturnType<typeof vi.fn>).mock.calls[0]![0] as { tokenHash: string };
      expect(call.tokenHash).toBe(expectedHash);
    });
  });

  describe("rotate", () => {
    it("revokes old session and creates a new one for the same profile", async () => {
      const { createHash } = await import("node:crypto");
      const sessionRepo = makeSessionRepo();
      const currentToken = "a".repeat(64);
      const currentHash = createHash("sha256").update(currentToken, "utf8").digest("hex");

      (sessionRepo.findByTokenHash as ReturnType<typeof vi.fn>).mockResolvedValue({
        tokenHash: currentHash,
        profileId: "00000000-0000-0000-0000-000000000001",
        expiresAt: new Date(Date.now() + 86400000),
      });

      const service = new SessionService(sessionRepo);
      const result = await service.rotate(currentToken);

      // Old session revoked
      expect(sessionRepo.revokeByTokenHash).toHaveBeenCalledWith(currentHash);

      // New session created
      expect(sessionRepo.create).toHaveBeenCalledOnce();
      const call = (sessionRepo.create as ReturnType<typeof vi.fn>).mock.calls[0]![0] as { tokenHash: string; profileId: string };
      expect(call.profileId).toBe("00000000-0000-0000-0000-000000000001");

      // New token is different from old
      expect(result.sessionToken).not.toBe(currentToken);
      expect(result.sessionToken.length).toBe(64);
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it("throws SESSION_NOT_FOUND when current token does not exist", async () => {
      const sessionRepo = makeSessionRepo();
      (sessionRepo.findByTokenHash as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const service = new SessionService(sessionRepo);

      await expect(service.rotate("nonexistent-token")).rejects.toThrow("Session not found");
      await expect(service.rotate("nonexistent-token")).rejects.toMatchObject({ code: "SESSION_NOT_FOUND" });
    });

    it("throws SESSION_REVOKED when session is already revoked", async () => {
      const { createHash } = await import("node:crypto");
      const sessionRepo = makeSessionRepo();
      const token = "b".repeat(64);
      const hash = createHash("sha256").update(token, "utf8").digest("hex");

      (sessionRepo.findByTokenHash as ReturnType<typeof vi.fn>).mockResolvedValue({
        tokenHash: hash,
        profileId: "00000000-0000-0000-0000-000000000001",
        expiresAt: new Date(Date.now() + 86400000),
        revokedAt: new Date(),
      });

      const service = new SessionService(sessionRepo);

      await expect(service.rotate(token)).rejects.toThrow("Session already revoked");
      await expect(service.rotate(token)).rejects.toMatchObject({ code: "SESSION_REVOKED" });
    });

    it("throws SESSION_EXPIRED when session has expired", async () => {
      const { createHash } = await import("node:crypto");
      const sessionRepo = makeSessionRepo();
      const token = "c".repeat(64);
      const hash = createHash("sha256").update(token, "utf8").digest("hex");

      (sessionRepo.findByTokenHash as ReturnType<typeof vi.fn>).mockResolvedValue({
        tokenHash: hash,
        profileId: "00000000-0000-0000-0000-000000000001",
        expiresAt: new Date(Date.now() - 1000),
      });

      const service = new SessionService(sessionRepo);

      await expect(service.rotate(token)).rejects.toThrow("Session expired");
      await expect(service.rotate(token)).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
    });
  });

  describe("revoke", () => {
    it("revokes an existing session by raw token", async () => {
      const { createHash } = await import("node:crypto");
      const sessionRepo = makeSessionRepo();
      const rawToken = "d".repeat(64);
      const tokenHash = createHash("sha256").update(rawToken, "utf8").digest("hex");

      (sessionRepo.findByTokenHash as ReturnType<typeof vi.fn>).mockResolvedValue({
        tokenHash,
        profileId: "00000000-0000-0000-0000-000000000001",
        expiresAt: new Date(Date.now() + 86400000),
      });

      const service = new SessionService(sessionRepo);
      await service.revoke(rawToken);

      expect(sessionRepo.revokeByTokenHash).toHaveBeenCalledWith(tokenHash);
    });

    it("throws SESSION_NOT_FOUND when token does not exist", async () => {
      const sessionRepo = makeSessionRepo();
      (sessionRepo.findByTokenHash as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const service = new SessionService(sessionRepo);

      await expect(service.revoke("nonexistent")).rejects.toThrow("Session not found");
      await expect(service.revoke("nonexistent")).rejects.toMatchObject({ code: "SESSION_NOT_FOUND" });
    });
  });

  describe("revokeAll", () => {
    it("delegates to revokeAllForProfile", async () => {
      const sessionRepo = makeSessionRepo();
      const service = new SessionService(sessionRepo);
      const profileId = "00000000-0000-0000-0000-000000000001";

      await service.revokeAll(profileId);

      expect(sessionRepo.revokeAllForProfile).toHaveBeenCalledWith(profileId);
    });
  });
});

describe("encodeFeedCursor / decodeFeedCursor", () => {
  it("roundtrips a cursor correctly", () => {
    const groupKey = "actor1:book_added:12345";
    const occurredAt = new Date("2025-06-01T12:00:00.000Z");

    const cursor = encodeFeedCursor(groupKey, occurredAt);
    const decoded = decodeFeedCursor(cursor);

    expect(decoded).not.toBeNull();
    expect(decoded!.groupKey).toBe(groupKey);
    expect(decoded!.occurredAt.getTime()).toBe(occurredAt.getTime());
  });

  it("returns null for malformed cursor", () => {
    expect(decodeFeedCursor("not-valid-base64!!!")).toBeNull();
    expect(decodeFeedCursor("")).toBeNull();
  });

  it("returns null for cursor missing fields", () => {
    const partial = Buffer.from(JSON.stringify({ groupKey: "abc" }), "utf8").toString("base64url");
    expect(decodeFeedCursor(partial)).toBeNull();
  });

  it("returns null for cursor with invalid date", () => {
    const invalid = Buffer.from(JSON.stringify({ groupKey: "abc", occurredAt: "not-a-date" }), "utf8").toString("base64url");
    expect(decodeFeedCursor(invalid)).toBeNull();
  });

  it("encodes cursor as base64url (no padding, URL-safe chars)", () => {
    const cursor = encodeFeedCursor("a:b:c", new Date("2025-01-01T00:00:00Z"));
    // base64url uses - and _ instead of + and /
    expect(cursor).not.toMatch(/[+/=]/);
  });
});

describe("groupFeedItems", () => {
  function makeFeedItem(overrides: { id?: string; actorId?: string; groupKey?: string | undefined; occurredAt?: Date }): FeedItem {
    const now = new Date();
    const event: FeedItem["event"] = {
      id: overrides.id ?? "e1",
      actorId: overrides.actorId ?? "a1",
      verb: "book_added",
      visibility: "followers",
      occurredAt: overrides.occurredAt ?? now,
    };
    if ("groupKey" in overrides && overrides.groupKey !== undefined) {
      event.groupKey = overrides.groupKey;
    }
    return {
      event,
      actor: {
        id: overrides.actorId ?? "a1",
        handle: "user",
        displayName: "User",
        verified: false,
        defaultVisibility: POSTURE_C_DEFAULTS,
        version: 1,
        createdAt: now,
        updatedAt: now,
      },
    };
  }

  it("groups items with the same groupKey into one group", () => {
    const t1 = new Date("2025-01-01T12:00:00Z");
    const t2 = new Date("2025-01-01T12:10:00Z");

    const items: FeedItem[] = [
      makeFeedItem({ id: "e1", groupKey: "g1", occurredAt: t2 }),
      makeFeedItem({ id: "e2", groupKey: "g1", occurredAt: t1 }),
    ];

    const groups = groupFeedItems(items);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.groupKey).toBe("g1");
    expect(groups[0]!.items).toHaveLength(2);
    // occurredAt should be the earliest event in the group
    expect(groups[0]!.occurredAt.getTime()).toBe(t1.getTime());
  });

  it("keeps items with different groupKeys in separate groups", () => {
    const items: FeedItem[] = [
      makeFeedItem({ id: "e1", groupKey: "g1", occurredAt: new Date("2025-01-01T12:30:00Z") }),
      makeFeedItem({ id: "e2", groupKey: "g2", occurredAt: new Date("2025-01-01T12:00:00Z") }),
    ];

    const groups = groupFeedItems(items);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.groupKey).toBe("g1");
    expect(groups[1]!.groupKey).toBe("g2");
  });

  it("treats items without groupKey as individual groups (keyed by event id)", () => {
    const items: FeedItem[] = [
      makeFeedItem({ id: "e1", occurredAt: new Date("2025-01-01T12:30:00Z") }),
      makeFeedItem({ id: "e2", occurredAt: new Date("2025-01-01T12:00:00Z") }),
    ];

    const groups = groupFeedItems(items);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.groupKey).toBe("e1");
    expect(groups[1]!.groupKey).toBe("e2");
  });

  it("preserves insertion order of groups", () => {
    const items: FeedItem[] = [
      makeFeedItem({ id: "e1", groupKey: "g1", occurredAt: new Date("2025-01-01T12:30:00Z") }),
      makeFeedItem({ id: "e2", groupKey: "g2", occurredAt: new Date("2025-01-01T12:20:00Z") }),
      makeFeedItem({ id: "e3", groupKey: "g1", occurredAt: new Date("2025-01-01T12:10:00Z") }),
      makeFeedItem({ id: "e4", groupKey: "g3", occurredAt: new Date("2025-01-01T12:00:00Z") }),
    ];

    const groups = groupFeedItems(items);
    expect(groups).toHaveLength(3);
    expect(groups[0]!.groupKey).toBe("g1");
    expect(groups[0]!.items).toHaveLength(2);
    expect(groups[1]!.groupKey).toBe("g2");
    expect(groups[1]!.items).toHaveLength(1);
    expect(groups[2]!.groupKey).toBe("g3");
    expect(groups[2]!.items).toHaveLength(1);
  });

  it("returns empty array for empty input", () => {
    expect(groupFeedItems([])).toEqual([]);
  });
});

describe("AccountDeletionService", () => {
  const UUID1 = "00000000-0000-0000-0000-000000000001";
  const NOW = new Date("2026-05-11T00:00:00Z");
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

  function makeDeletionRepo(overrides?: Record<string, unknown>) {
    return {
      create: vi.fn().mockImplementation(async (input: { profileId: string; requestedAt: Date; hardDeleteAfter: Date }) => ({
        profileId: input.profileId,
        requestedAt: input.requestedAt,
        hardDeleteAfter: input.hardDeleteAfter,
      })),
      findByProfileId: vi.fn().mockResolvedValue(null),
      delete: vi.fn(),
      listExpired: vi.fn().mockResolvedValue([]),
      purgeProfile: vi.fn(),
      ...overrides,
    };
  }

  function makeSessionRepo() {
    return {
      create: vi.fn(),
      findByTokenHash: vi.fn(),
      revokeByTokenHash: vi.fn(),
      revokeAllForProfile: vi.fn(),
    };
  }

  it("creates a deletion record with 30-day grace period", async () => {
    const deletionRepo = makeDeletionRepo();
    const sessionRepo = makeSessionRepo();
    const service = new AccountDeletionService(deletionRepo, sessionRepo);

    const result = await service.requestDelete(UUID1);

    expect(result.profileId).toBe(UUID1);
    const diff = result.hardDeleteAfter.getTime() - result.requestedAt.getTime();
    expect(diff).toBe(THIRTY_DAYS);
    expect(deletionRepo.create).toHaveBeenCalledOnce();
  });

  it("revokes all sessions on delete request", async () => {
    const deletionRepo = makeDeletionRepo();
    const sessionRepo = makeSessionRepo();
    const service = new AccountDeletionService(deletionRepo, sessionRepo);

    await service.requestDelete(UUID1);

    expect(sessionRepo.revokeAllForProfile).toHaveBeenCalledWith(UUID1);
  });

  it("is idempotent — returns existing record if already pending", async () => {
    const existing = {
      profileId: UUID1,
      requestedAt: NOW,
      hardDeleteAfter: new Date(NOW.getTime() + THIRTY_DAYS),
    };
    const deletionRepo = makeDeletionRepo({
      findByProfileId: vi.fn().mockResolvedValue(existing),
    });
    const sessionRepo = makeSessionRepo();
    const service = new AccountDeletionService(deletionRepo, sessionRepo);

    const result = await service.requestDelete(UUID1);

    expect(result).toBe(existing);
    expect(deletionRepo.create).not.toHaveBeenCalled();
    expect(sessionRepo.revokeAllForProfile).not.toHaveBeenCalled();
  });

  it("cancelDelete removes the record within grace period", async () => {
    const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24);
    const deletionRepo = makeDeletionRepo({
      findByProfileId: vi.fn().mockResolvedValue({
        profileId: UUID1,
        requestedAt: NOW,
        hardDeleteAfter: futureDate,
      }),
    });
    const sessionRepo = makeSessionRepo();
    const service = new AccountDeletionService(deletionRepo, sessionRepo);

    const cancelled = await service.cancelDelete(UUID1);

    expect(cancelled).toBe(true);
    expect(deletionRepo.delete).toHaveBeenCalledWith(UUID1);
  });

  it("cancelDelete returns false when no deletion exists", async () => {
    const deletionRepo = makeDeletionRepo();
    const sessionRepo = makeSessionRepo();
    const service = new AccountDeletionService(deletionRepo, sessionRepo);

    const cancelled = await service.cancelDelete(UUID1);

    expect(cancelled).toBe(false);
    expect(deletionRepo.delete).not.toHaveBeenCalled();
  });

  it("cancelDelete returns false when grace period has expired", async () => {
    const pastDate = new Date(Date.now() - 1000);
    const deletionRepo = makeDeletionRepo({
      findByProfileId: vi.fn().mockResolvedValue({
        profileId: UUID1,
        requestedAt: NOW,
        hardDeleteAfter: pastDate,
      }),
    });
    const sessionRepo = makeSessionRepo();
    const service = new AccountDeletionService(deletionRepo, sessionRepo);

    const cancelled = await service.cancelDelete(UUID1);

    expect(cancelled).toBe(false);
    expect(deletionRepo.delete).not.toHaveBeenCalled();
  });

  it("isSoftDeleted returns true when deletion exists", async () => {
    const deletionRepo = makeDeletionRepo({
      findByProfileId: vi.fn().mockResolvedValue({
        profileId: UUID1,
        requestedAt: NOW,
        hardDeleteAfter: new Date(NOW.getTime() + THIRTY_DAYS),
      }),
    });
    const sessionRepo = makeSessionRepo();
    const service = new AccountDeletionService(deletionRepo, sessionRepo);

    expect(await service.isSoftDeleted(UUID1)).toBe(true);
  });

  it("isSoftDeleted returns false when no deletion exists", async () => {
    const deletionRepo = makeDeletionRepo();
    const sessionRepo = makeSessionRepo();
    const service = new AccountDeletionService(deletionRepo, sessionRepo);

    expect(await service.isSoftDeleted(UUID1)).toBe(false);
  });

  it("cancelDelete restores visibility — isSoftDeleted flips to false after cancel", async () => {
    // Model the repo as a real backing store: state lives in this map and
    // findByProfileId/delete read+mutate it. This proves that after
    // cancelDelete removes the row, any surface that queries deletion state
    // (here: isSoftDeleted) sees the user as live.
    const store = new Map<string, { profileId: string; requestedAt: Date; hardDeleteAfter: Date }>();
    store.set(UUID1, {
      profileId: UUID1,
      requestedAt: NOW,
      hardDeleteAfter: new Date(NOW.getTime() + THIRTY_DAYS),
    });
    const deletionRepo = {
      create: vi.fn(),
      findByProfileId: vi.fn().mockImplementation(async (id: string) => store.get(id) ?? null),
      delete: vi.fn().mockImplementation(async (id: string) => {
        store.delete(id);
      }),
      listExpired: vi.fn().mockResolvedValue([]),
      purgeProfile: vi.fn(),
    };
    const sessionRepo = makeSessionRepo();
    const service = new AccountDeletionService(deletionRepo, sessionRepo);

    expect(await service.isSoftDeleted(UUID1)).toBe(true);

    const cancelled = await service.cancelDelete(UUID1);
    expect(cancelled).toBe(true);
    expect(deletionRepo.delete).toHaveBeenCalledWith(UUID1);

    // After cancel, the row is gone — visibility surfaces keying off
    // deletion state observe the user as not soft-deleted.
    expect(await service.isSoftDeleted(UUID1)).toBe(false);
  });

  describe("runHardDelete (R-02 cron)", () => {
    const UUID2 = "00000000-0000-0000-0000-000000000002";
    const UUID3 = "00000000-0000-0000-0000-000000000003";

    it("returns 0 when nothing is expired", async () => {
      const deletionRepo = {
        create: vi.fn(),
        findByProfileId: vi.fn(),
        delete: vi.fn(),
        listExpired: vi.fn().mockResolvedValue([]),
        purgeProfile: vi.fn(),
      };
      const service = new AccountDeletionService(deletionRepo, makeSessionRepo());

      const purged = await service.runHardDelete(NOW);

      expect(purged).toBe(0);
      expect(deletionRepo.purgeProfile).not.toHaveBeenCalled();
    });

    it("purges every expired account and returns the count", async () => {
      const expired = [
        { profileId: UUID1, requestedAt: NOW, hardDeleteAfter: new Date(NOW.getTime() - 1000) },
        { profileId: UUID2, requestedAt: NOW, hardDeleteAfter: new Date(NOW.getTime() - 1) },
        { profileId: UUID3, requestedAt: NOW, hardDeleteAfter: NOW },
      ];
      const deletionRepo = {
        create: vi.fn(),
        findByProfileId: vi.fn(),
        delete: vi.fn(),
        listExpired: vi.fn().mockResolvedValue(expired),
        purgeProfile: vi.fn().mockResolvedValue(undefined),
      };
      const service = new AccountDeletionService(deletionRepo, makeSessionRepo());

      const purged = await service.runHardDelete(NOW);

      expect(purged).toBe(3);
      expect(deletionRepo.listExpired).toHaveBeenCalledWith(NOW);
      expect(deletionRepo.purgeProfile).toHaveBeenCalledTimes(3);
      expect(deletionRepo.purgeProfile).toHaveBeenNthCalledWith(1, UUID1);
      expect(deletionRepo.purgeProfile).toHaveBeenNthCalledWith(2, UUID2);
      expect(deletionRepo.purgeProfile).toHaveBeenNthCalledWith(3, UUID3);
    });

    it("uses now() by default and does not purge unexpired records", async () => {
      const listExpired = vi.fn().mockResolvedValue([]);
      const deletionRepo = {
        create: vi.fn(),
        findByProfileId: vi.fn(),
        delete: vi.fn(),
        listExpired,
        purgeProfile: vi.fn(),
      };
      const service = new AccountDeletionService(deletionRepo, makeSessionRepo());

      const before = Date.now();
      await service.runHardDelete();
      const after = Date.now();

      expect(listExpired).toHaveBeenCalledOnce();
      const arg = listExpired.mock.calls[0]![0] as Date;
      expect(arg).toBeInstanceOf(Date);
      expect(arg.getTime()).toBeGreaterThanOrEqual(before);
      expect(arg.getTime()).toBeLessThanOrEqual(after);
    });

    it("propagates errors from purgeProfile so the cron run is retried", async () => {
      const expired = [
        { profileId: UUID1, requestedAt: NOW, hardDeleteAfter: new Date(NOW.getTime() - 1000) },
      ];
      const deletionRepo = {
        create: vi.fn(),
        findByProfileId: vi.fn(),
        delete: vi.fn(),
        listExpired: vi.fn().mockResolvedValue(expired),
        purgeProfile: vi.fn().mockRejectedValue(new Error("db down")),
      };
      const service = new AccountDeletionService(deletionRepo, makeSessionRepo());

      await expect(service.runHardDelete(NOW)).rejects.toThrow("db down");
    });

    // ---------------------------------------------------------------
    // Tombstone reaping (S-06, #161)
    // ---------------------------------------------------------------

    it("reaps expired tombstones when a tombstone repo is wired", async () => {
      const deletionRepo = {
        create: vi.fn(),
        findByProfileId: vi.fn(),
        delete: vi.fn(),
        listExpired: vi.fn().mockResolvedValue([]),
        purgeProfile: vi.fn(),
      };
      const tombstoneRepo = {
        create: vi.fn(),
        findByHandle: vi.fn(),
        purgeExpired: vi.fn().mockResolvedValue(7),
      };
      const service = new AccountDeletionService(
        deletionRepo,
        makeSessionRepo(),
        tombstoneRepo,
      );

      await service.runHardDelete(NOW);

      expect(tombstoneRepo.purgeExpired).toHaveBeenCalledWith(NOW);
    });

    it("skips tombstone reaping when no tombstone repo is wired", async () => {
      const deletionRepo = {
        create: vi.fn(),
        findByProfileId: vi.fn(),
        delete: vi.fn(),
        listExpired: vi.fn().mockResolvedValue([]),
        purgeProfile: vi.fn(),
      };
      const service = new AccountDeletionService(deletionRepo, makeSessionRepo());

      // Just assert it doesn't throw; the absence of a tombstones field
      // means there is nothing to call.
      await expect(service.runHardDelete(NOW)).resolves.toBe(0);
    });

    it("still purges profiles when the tombstone repo is wired", async () => {
      const expired = [
        { profileId: UUID1, requestedAt: NOW, hardDeleteAfter: new Date(NOW.getTime() - 1000) },
      ];
      const deletionRepo = {
        create: vi.fn(),
        findByProfileId: vi.fn(),
        delete: vi.fn(),
        listExpired: vi.fn().mockResolvedValue(expired),
        purgeProfile: vi.fn().mockResolvedValue(undefined),
      };
      const tombstoneRepo = {
        create: vi.fn(),
        findByHandle: vi.fn(),
        purgeExpired: vi.fn().mockResolvedValue(0),
      };
      const service = new AccountDeletionService(
        deletionRepo,
        makeSessionRepo(),
        tombstoneRepo,
      );

      const purged = await service.runHardDelete(NOW);

      expect(purged).toBe(1);
      expect(deletionRepo.purgeProfile).toHaveBeenCalledWith(UUID1);
      expect(tombstoneRepo.purgeExpired).toHaveBeenCalledWith(NOW);
    });
  });
});
