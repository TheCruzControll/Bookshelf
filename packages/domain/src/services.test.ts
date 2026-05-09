import { describe, it, expect, vi } from "vitest";
import { ShelfService, HandleService, AppServices, ProfileService, RankingService, SYSTEM_SHELVES, slugify } from "./services";
import type { ShelfRepository, ActivityRepository, AppRepositories, AuthProvider, ProfileRepository, RankingRepository } from "./ports";
import type { Profile, Ranking, Shelf, ShelfItem } from "./types";

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
    defaultVisibility: "public",
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
      reviews: { create: vi.fn(), update: vi.fn() },
      activity: { append: vi.fn(), getFriendFeed: vi.fn() },
      recommendations: { getForUser: vi.fn() },
      follows: { follow: vi.fn(), unfollow: vi.fn(), findFollow: vi.fn(), listFollowers: vi.fn(), listFollowing: vi.fn(), isMutual: vi.fn() },
      blocks: { block: vi.fn(), unblock: vi.fn(), findBlock: vi.fn(), listBlockedByUser: vi.fn(), isBlocked: vi.fn() },
      rankings: { upsert: vi.fn(), findById: vi.fn(), findByOwnerAndBook: vi.fn(), listByOwner: vi.fn(), delete: vi.fn(), startBucket: vi.fn() },
      notifications: { registerToken: vi.fn(), removeToken: vi.fn(), listTokensForUser: vi.fn() },
      imports: { create: vi.fn(), findById: vi.fn(), findByOwnerAndHash: vi.fn(), listByOwner: vi.fn(), updateStatus: vi.fn() },
      contacts: { upsertHashes: vi.fn(), findMatches: vi.fn(), deleteForUser: vi.fn(), deleteExpired: vi.fn(), listByUser: vi.fn() },
      lists: { create: vi.fn(), findById: vi.fn(), listByOwner: vi.fn(), update: vi.fn(), delete: vi.fn(), addItem: vi.fn(), removeItem: vi.fn(), listItems: vi.fn(), reorderItems: vi.fn() },
      sessions: { create: vi.fn(), findById: vi.fn(), deleteById: vi.fn(), deleteAllForUser: vi.fn() },
      handleHistory: { record: vi.fn(), findByOldHandle: vi.fn() }
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
    const rankingsRepo: RankingRepository = {
      upsert: vi.fn(),
      findByOwnerAndBook: vi.fn(),
      findById: vi.fn(),
      listByOwner: vi.fn(),
      delete: vi.fn(),
      startBucket: vi.fn().mockResolvedValue(ranking),
    };
    const service = new RankingService(rankingsRepo);
    const result = await service.startBucket({ ownerId: ranking.profileId, bookId: ranking.bookId, bucket: 3 });
    expect(rankingsRepo.startBucket).toHaveBeenCalledWith({ ownerId: ranking.profileId, bookId: ranking.bookId, bucket: 3 });
    expect(result.bucket).toBe(3);
  });
});
