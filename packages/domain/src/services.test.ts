import { describe, it, expect, vi } from "vitest";
import { subtle } from "node:crypto";
import { ShelfService, HandleService, AppServices, ProfileService, RankingService, AuthService, ReviewService, SYSTEM_SHELVES, slugify } from "./services";
import type { ShelfRepository, ActivityRepository, AppRepositories, AuthProvider, ProfileRepository, RankingRepository, AuthIdentityRepository, SessionRepository, AppleJwksProvider, AppleJwk, ReviewRepository } from "./ports";
import type { Profile, Ranking, Review, Shelf, ShelfItem } from "./types";

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
      notifications: { registerToken: vi.fn(), removeToken: vi.fn(), listTokensForProfile: vi.fn(), getSetting: vi.fn(), setSetting: vi.fn(), listSettings: vi.fn() },
      imports: { create: vi.fn(), findById: vi.fn(), findByOwnerAndHash: vi.fn(), listByOwner: vi.fn(), updateStatus: vi.fn() },
      contacts: { upsertHashes: vi.fn(), findMatches: vi.fn(), deleteForUser: vi.fn(), deleteExpired: vi.fn(), listByUser: vi.fn() },
      lists: { create: vi.fn(), findById: vi.fn(), listByOwner: vi.fn(), update: vi.fn(), delete: vi.fn(), addItem: vi.fn(), removeItem: vi.fn(), listItems: vi.fn(), reorderItems: vi.fn() },
      authIdentities: { create: vi.fn(), findByProvider: vi.fn(), listByProfile: vi.fn() },
      sessions: { create: vi.fn(), findByTokenHash: vi.fn(), revokeByTokenHash: vi.fn(), revokeAllForProfile: vi.fn() }
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
      findById: vi.fn(),
      findByOwnerAndBook: vi.fn(),
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

describe("ReviewService", () => {
  function makeReviewRepo(overrides?: Partial<ReviewRepository>): ReviewRepository {
    return { create: vi.fn(), update: vi.fn(), ...overrides };
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
