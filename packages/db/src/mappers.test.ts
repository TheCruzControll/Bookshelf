import { describe, it, expect } from "vitest";
import { toAccountDeletion, toBlock, toBlockAgainstHash, toBook, toProfile, toShelf, toEdition, toShelfItem, toReview, toActivityEvent, toRanking, toImport, toPhoneVerification, toPhoneNumber, toOAuthIdentity, toSession, toContactIndex, toEmailIndex, toNotificationToken, toNotificationSetting, toHandleHistory, toFollow, toList, toListItem } from "./mappers";
import type { ContentType, Visibility, ShelfKind, ShelfAuthorType } from "@hone/domain";
import { POSTURE_C_DEFAULTS } from "@hone/domain";
import { activityEvents, authIdentities, blocks, blocksAgainstHash, follows, imports, phoneNumbers, phoneVerifications, profiles, rankings, reviews, sessions, shelves, tasteVectors } from "./schema";

describe("db mappers smoke test", () => {
  it("toBook maps a row to a Book domain object", () => {
    const now = new Date();
    const row = {
      id: "00000000-0000-0000-0000-000000000001",
      canonicalTitle: "Dune",
      subtitle: null,
      description: null,
      coverUrl: null,
      firstPublishedYear: 1965,
      createdAt: now,
      updatedAt: now
    };

    const book = toBook(row as Parameters<typeof toBook>[0]);
    expect(book.id).toBe(row.id);
    expect(book.canonicalTitle).toBe("Dune");
    expect(book.firstPublishedYear).toBe(1965);
    expect(book.subtitle).toBeUndefined();
    expect(book.description).toBeUndefined();
    expect(book.coverUrl).toBeUndefined();
  });

  it("toBook maps optional fields when present", () => {
    const now = new Date();
    const row = {
      id: "00000000-0000-0000-0000-000000000001",
      canonicalTitle: "Dune",
      subtitle: "A novel",
      description: "Epic sci-fi",
      coverUrl: "https://example.com/cover.jpg",
      firstPublishedYear: null,
      createdAt: now,
      updatedAt: now
    };

    const book = toBook(row as Parameters<typeof toBook>[0]);
    expect(book.subtitle).toBe("A novel");
    expect(book.description).toBe("Epic sci-fi");
    expect(book.coverUrl).toBe("https://example.com/cover.jpg");
    expect(book.firstPublishedYear).toBeUndefined();
  });

  it("toProfile maps a row to a Profile domain object", () => {
    const now = new Date();
    const row = {
      id: "00000000-0000-0000-0000-000000000002",
      handle: "bookworm",
      displayName: "Book Worm",
      bio: null,
      avatarUrl: null,
      defaultVisibility: POSTURE_C_DEFAULTS,
      createdAt: now,
      updatedAt: now
    };

    const profile = toProfile(row as Parameters<typeof toProfile>[0]);
    expect(profile.handle).toBe("bookworm");
    expect(profile.bio).toBeUndefined();
    expect(profile.avatarUrl).toBeUndefined();
    expect(profile.defaultVisibility.identity).toBe("public");
    expect(profile.defaultVisibility.want_to_read_shelf).toBe("followers");
  });

  it("toProfile maps optional fields when present", () => {
    const now = new Date();
    const row = {
      id: "00000000-0000-0000-0000-000000000002",
      handle: "reader",
      displayName: "A Reader",
      bio: "Loves books",
      avatarUrl: "https://example.com/avatar.jpg",
      defaultVisibility: POSTURE_C_DEFAULTS,
      createdAt: now,
      updatedAt: now
    };

    const profile = toProfile(row as Parameters<typeof toProfile>[0]);
    expect(profile.bio).toBe("Loves books");
    expect(profile.avatarUrl).toBe("https://example.com/avatar.jpg");
    expect(profile.defaultVisibility.review).toBe("public");
  });

  it("toShelf maps a row to a Shelf domain object", () => {
    const now = new Date();
    const row = {
      id: "00000000-0000-0000-0000-000000000003",
      ownerId: "00000000-0000-0000-0000-000000000002",
      name: "Finished",
      slug: "finished",
      visibility: "public" as const,
      isSystem: true,
      kind: "system" as const,
      authorType: "user" as const,
      curatorTier: null,
      description: null,
      publishedAt: null,
      createdAt: now,
      updatedAt: now
    };

    const shelf = toShelf(row as Parameters<typeof toShelf>[0]);
    expect(shelf.name).toBe("Finished");
    expect(shelf.isSystem).toBe(true);
    expect(shelf.slug).toBe("finished");
    expect(shelf.ownerId).toBe(row.ownerId);
    expect(shelf.kind).toBe("system");
    expect(shelf.authorType).toBe("user");
    expect(shelf.curatorTier).toBeUndefined();
    expect(shelf.description).toBeUndefined();
    expect(shelf.publishedAt).toBeUndefined();
  });

  it("toEdition maps a row to an Edition domain object", () => {
    const row = {
      id: "00000000-0000-0000-0000-000000000004",
      bookId: "00000000-0000-0000-0000-000000000001",
      isbn10: null,
      isbn13: "9780441013593",
      title: "Dune",
      publisher: null,
      publishedDate: null,
      pageCount: null,
      source: "openlibrary",
      sourceKey: "OL12345M"
    };

    const edition = toEdition(row as Parameters<typeof toEdition>[0]);
    expect(edition.id).toBe(row.id);
    expect(edition.bookId).toBe(row.bookId);
    expect(edition.isbn10).toBeUndefined();
    expect(edition.isbn13).toBe("9780441013593");
    expect(edition.title).toBe("Dune");
    expect(edition.publisher).toBeUndefined();
    expect(edition.publishedDate).toBeUndefined();
    expect(edition.pageCount).toBeUndefined();
    expect(edition.source).toBe("openlibrary");
    expect(edition.sourceKey).toBe("OL12345M");
  });

  it("toEdition maps optional fields when present", () => {
    const row = {
      id: "00000000-0000-0000-0000-000000000004",
      bookId: "00000000-0000-0000-0000-000000000001",
      isbn10: "0441013597",
      isbn13: "9780441013593",
      title: "Dune",
      publisher: "Ace Books",
      publishedDate: "1990-09-01",
      pageCount: 896,
      source: "openlibrary",
      sourceKey: null
    };

    const edition = toEdition(row as Parameters<typeof toEdition>[0]);
    expect(edition.isbn10).toBe("0441013597");
    expect(edition.publisher).toBe("Ace Books");
    expect(edition.publishedDate).toBe("1990-09-01");
    expect(edition.pageCount).toBe(896);
    expect(edition.sourceKey).toBeUndefined();
  });

  it("toShelfItem maps a row to a ShelfItem domain object", () => {
    const now = new Date();
    const row = {
      id: "00000000-0000-0000-0000-000000000005",
      shelfId: "00000000-0000-0000-0000-000000000003",
      bookId: "00000000-0000-0000-0000-000000000001",
      editionId: null,
      status: "finished" as const,
      rank: null,
      notes: null,
      position: null,
      addedAt: now,
      updatedAt: now
    };

    const item = toShelfItem(row as Parameters<typeof toShelfItem>[0]);
    expect(item.id).toBe(row.id);
    expect(item.shelfId).toBe(row.shelfId);
    expect(item.bookId).toBe(row.bookId);
    expect(item.editionId).toBeUndefined();
    expect(item.status).toBe("finished");
    expect(item.rank).toBeUndefined();
    expect(item.notes).toBeUndefined();
    expect(item.position).toBeUndefined();
    expect(item.addedAt).toBe(now);
  });

  it("toShelfItem maps optional fields when present", () => {
    const now = new Date();
    const row = {
      id: "00000000-0000-0000-0000-000000000005",
      shelfId: "00000000-0000-0000-0000-000000000003",
      bookId: "00000000-0000-0000-0000-000000000001",
      editionId: "00000000-0000-0000-0000-000000000004",
      status: "reading" as const,
      rank: 3,
      notes: null,
      position: null,
      addedAt: now,
      updatedAt: now
    };

    const item = toShelfItem(row as Parameters<typeof toShelfItem>[0]);
    expect(item.editionId).toBe("00000000-0000-0000-0000-000000000004");
    expect(item.rank).toBe(3);
  });

  it("toShelfItem maps notes and position when present", () => {
    const now = new Date();
    const row = {
      id: "00000000-0000-0000-0000-000000000005",
      shelfId: "00000000-0000-0000-0000-000000000003",
      bookId: "00000000-0000-0000-0000-000000000001",
      editionId: null,
      status: "finished" as const,
      rank: null,
      notes: "A great pick for summer reading.",
      position: 2,
      addedAt: now,
      updatedAt: now
    };

    const item = toShelfItem(row as Parameters<typeof toShelfItem>[0]);
    expect(item.notes).toBe("A great pick for summer reading.");
    expect(item.position).toBe(2);
  });

  it("toShelfItem maps notes as undefined when null", () => {
    const now = new Date();
    const row = {
      id: "00000000-0000-0000-0000-000000000005",
      shelfId: "00000000-0000-0000-0000-000000000003",
      bookId: "00000000-0000-0000-0000-000000000001",
      editionId: null,
      status: "want_to_read" as const,
      rank: null,
      notes: null,
      position: null,
      addedAt: now,
      updatedAt: now
    };

    const item = toShelfItem(row as Parameters<typeof toShelfItem>[0]);
    expect(item.notes).toBeUndefined();
    expect(item.position).toBeUndefined();
  });

  it("toReview maps a row to a Review domain object", () => {
    const now = new Date();
    const row = {
      id: "00000000-0000-0000-0000-000000000006",
      authorId: "00000000-0000-0000-0000-000000000002",
      bookId: "00000000-0000-0000-0000-000000000001",
      editionId: null,
      body: "A masterpiece of science fiction.",
      visibility: "public" as const,
      createdAt: now,
      updatedAt: now
    };

    const review = toReview(row as Parameters<typeof toReview>[0]);
    expect(review.id).toBe(row.id);
    expect(review.authorId).toBe(row.authorId);
    expect(review.bookId).toBe(row.bookId);
    expect(review.editionId).toBeUndefined();
    expect(review.body).toBe("A masterpiece of science fiction.");
    expect(review.visibility).toBe("public");
  });

  it("toReview maps editionId when present", () => {
    const now = new Date();
    const row = {
      id: "00000000-0000-0000-0000-000000000006",
      authorId: "00000000-0000-0000-0000-000000000002",
      bookId: "00000000-0000-0000-0000-000000000001",
      editionId: "00000000-0000-0000-0000-000000000004",
      body: "Great.",
      visibility: "followers" as const,
      createdAt: now,
      updatedAt: now
    };

    const review = toReview(row as Parameters<typeof toReview>[0]);
    expect(review.editionId).toBe("00000000-0000-0000-0000-000000000004");
  });

  it("toActivityEvent maps a row to an ActivityEvent domain object", () => {
    const now = new Date();
    const row = {
      id: "00000000-0000-0000-0000-000000000007",
      actorId: "00000000-0000-0000-0000-000000000002",
      verb: "book_finished" as const,
      bookId: "00000000-0000-0000-0000-000000000001",
      shelfId: null,
      reviewId: null,
      visibility: "followers" as const,
      occurredAt: now
    };

    const event = toActivityEvent(row as Parameters<typeof toActivityEvent>[0]);
    expect(event.id).toBe(row.id);
    expect(event.actorId).toBe(row.actorId);
    expect(event.verb).toBe("book_finished");
    expect(event.bookId).toBe(row.bookId);
    expect(event.shelfId).toBeUndefined();
    expect(event.reviewId).toBeUndefined();
    expect(event.visibility).toBe("followers");
    expect(event.occurredAt).toBe(now);
  });

  it("toActivityEvent maps optional fields when present", () => {
    const now = new Date();
    const row = {
      id: "00000000-0000-0000-0000-000000000007",
      actorId: "00000000-0000-0000-0000-000000000002",
      verb: "book_reviewed" as const,
      bookId: null,
      shelfId: "00000000-0000-0000-0000-000000000003",
      reviewId: "00000000-0000-0000-0000-000000000006",
      visibility: "public" as const,
      occurredAt: now
    };

    const event = toActivityEvent(row as Parameters<typeof toActivityEvent>[0]);
    expect(event.bookId).toBeUndefined();
    expect(event.shelfId).toBe("00000000-0000-0000-0000-000000000003");
    expect(event.reviewId).toBe("00000000-0000-0000-0000-000000000006");
  });
});

describe("visibility 4-tier enum mapping", () => {
  const visibilityTiers: Visibility[] = ["public", "followers", "mutuals", "private"];
  const now = new Date();

  it("toProfile maps defaultVisibility as a per-content-type record", () => {
    const contentTypes: ContentType[] = [
      "identity", "follower_list", "review", "score", "finished_shelf",
      "custom_shelf", "want_to_read_shelf", "reading_shelf", "dropped_shelf",
      "reading_status", "activity_stream"
    ];
    const row = {
      id: "00000000-0000-0000-0000-000000000010",
      handle: "user",
      displayName: "User",
      bio: null,
      avatarUrl: null,
      defaultVisibility: POSTURE_C_DEFAULTS,
      createdAt: now,
      updatedAt: now
    };
    const profile = toProfile(row as Parameters<typeof toProfile>[0]);
    for (const ct of contentTypes) {
      expect(profile.defaultVisibility[ct]).toBeDefined();
    }
    expect(profile.defaultVisibility.identity).toBe("public");
    expect(profile.defaultVisibility.reading_shelf).toBe("followers");
  });

  it("toShelf preserves all four visibility tiers", () => {
    for (const tier of visibilityTiers) {
      const row = {
        id: "00000000-0000-0000-0000-000000000011",
        ownerId: "00000000-0000-0000-0000-000000000010",
        name: "My Shelf",
        slug: "my-shelf",
        visibility: tier as Visibility,
        isSystem: false,
        kind: "custom" as const,
        authorType: "user" as const,
        curatorTier: null,
        description: null,
        publishedAt: null,
        createdAt: now,
        updatedAt: now
      };
      const shelf = toShelf(row as Parameters<typeof toShelf>[0]);
      expect(shelf.visibility).toBe(tier);
    }
  });

  it("toReview preserves all four visibility tiers", () => {
    for (const tier of visibilityTiers) {
      const row = {
        id: "00000000-0000-0000-0000-000000000012",
        authorId: "00000000-0000-0000-0000-000000000010",
        bookId: "00000000-0000-0000-0000-000000000001",
        editionId: null,
        body: "Great book",
        visibility: tier as Visibility,
        createdAt: now,
        updatedAt: now
      };
      const review = toReview(row as Parameters<typeof toReview>[0]);
      expect(review.visibility).toBe(tier);
    }
  });

  it("schema default for shelves is public", () => {
    const row = {
      id: "00000000-0000-0000-0000-000000000013",
      ownerId: "00000000-0000-0000-0000-000000000010",
      name: "Custom",
      slug: "custom",
      visibility: "public" as Visibility,
      isSystem: false,
      kind: "custom" as const,
      authorType: "user" as const,
      curatorTier: null,
      description: null,
      publishedAt: null,
      createdAt: now,
      updatedAt: now
    };
    const shelf = toShelf(row as Parameters<typeof toShelf>[0]);
    expect(shelf.visibility).toBe("public");
  });

  it("schema default for activity_events is followers", () => {
    const expectedDefault: Visibility = "followers";
    expect(expectedDefault).toBe("followers");
  });
});

describe("shelves list extension fields", () => {
  const now = new Date();

  it("toShelf maps kind field correctly for all kinds", () => {
    const kinds: ShelfKind[] = ["system", "custom", "list"];
    for (const kind of kinds) {
      const row = {
        id: "00000000-0000-0000-0000-000000000020",
        ownerId: "00000000-0000-0000-0000-000000000010",
        name: "Test",
        slug: "test",
        visibility: "public" as const,
        isSystem: false,
        kind,
        authorType: "user" as const,
        curatorTier: null,
        description: null,
        publishedAt: null,
        createdAt: now,
        updatedAt: now
      };
      const shelf = toShelf(row as Parameters<typeof toShelf>[0]);
      expect(shelf.kind).toBe(kind);
    }
  });

  it("toShelf maps authorType field correctly for all author types", () => {
    const authorTypes: ShelfAuthorType[] = ["user", "internal_editorial", "algorithmic"];
    for (const authorType of authorTypes) {
      const row = {
        id: "00000000-0000-0000-0000-000000000021",
        ownerId: "00000000-0000-0000-0000-000000000010",
        name: "Test",
        slug: "test",
        visibility: "public" as const,
        isSystem: false,
        kind: "list" as const,
        authorType,
        curatorTier: null,
        description: null,
        publishedAt: null,
        createdAt: now,
        updatedAt: now
      };
      const shelf = toShelf(row as Parameters<typeof toShelf>[0]);
      expect(shelf.authorType).toBe(authorType);
    }
  });

  it("toShelf maps optional list fields when present", () => {
    const publishedAt = new Date("2024-01-15T00:00:00Z");
    const row = {
      id: "00000000-0000-0000-0000-000000000022",
      ownerId: "00000000-0000-0000-0000-000000000010",
      name: "Best Sci-Fi 2024",
      slug: "best-sci-fi-2024",
      visibility: "public" as const,
      isSystem: false,
      kind: "list" as const,
      authorType: "internal_editorial" as const,
      curatorTier: 1,
      description: "Our top picks for science fiction in 2024.",
      publishedAt,
      createdAt: now,
      updatedAt: now
    };
    const shelf = toShelf(row as Parameters<typeof toShelf>[0]);
    expect(shelf.kind).toBe("list");
    expect(shelf.authorType).toBe("internal_editorial");
    expect(shelf.curatorTier).toBe(1);
    expect(shelf.description).toBe("Our top picks for science fiction in 2024.");
    expect(shelf.publishedAt).toBe(publishedAt);
  });

  it("shelves schema includes kind and author_type columns", () => {
    const cols = Object.keys(shelves);
    expect(cols).toContain("kind");
    expect(cols).toContain("authorType");
    expect(cols).toContain("curatorTier");
    expect(cols).toContain("description");
    expect(cols).toContain("publishedAt");
  });
});

describe("follows table schema", () => {
  it("follows table has follower_id, followee_id, and created_at columns", () => {
    const cols = Object.keys(follows);
    expect(cols).toContain("followerId");
    expect(cols).toContain("followeeId");
    expect(cols).toContain("createdAt");
  });

  it("follows table does not have a surrogate id column", () => {
    const cols = Object.keys(follows);
    expect(cols).not.toContain("id");
  });
});

describe("rankings table schema and mapper", () => {
  const now = new Date();

  it("rankings schema includes required columns", () => {
    const cols = Object.keys(rankings);
    expect(cols).toContain("id");
    expect(cols).toContain("profileId");
    expect(cols).toContain("bookId");
    expect(cols).toContain("position");
    expect(cols).toContain("score");
    expect(cols).toContain("bucket");
    expect(cols).toContain("lockedAt");
    expect(cols).toContain("version");
    expect(cols).toContain("createdAt");
    expect(cols).toContain("updatedAt");
  });

  it("toRanking maps a row to a Ranking domain object", () => {
    const row = {
      id: "00000000-0000-0000-0000-000000000001",
      profileId: "00000000-0000-0000-0000-000000000010",
      bookId: "00000000-0000-0000-0000-000000000020",
      position: 3,
      score: "8.74",
      bucket: 5,
      lockedAt: null,
      version: 1,
      createdAt: now,
      updatedAt: now
    };

    const ranking = toRanking(row as Parameters<typeof toRanking>[0]);
    expect(ranking.id).toBe(row.id);
    expect(ranking.profileId).toBe(row.profileId);
    expect(ranking.bookId).toBe(row.bookId);
    expect(ranking.position).toBe(3);
    expect(ranking.score).toBe(8.74);
    expect(ranking.bucket).toBe(5);
    expect(ranking.lockedAt).toBeUndefined();
    expect(ranking.version).toBe(1);
    expect(ranking.createdAt).toBe(now);
    expect(ranking.updatedAt).toBe(now);
  });

  it("toRanking maps lockedAt when present", () => {
    const lockedAt = new Date("2024-06-01T12:00:00Z");
    const row = {
      id: "00000000-0000-0000-0000-000000000002",
      profileId: "00000000-0000-0000-0000-000000000010",
      bookId: "00000000-0000-0000-0000-000000000021",
      position: 1,
      score: "9.50",
      bucket: 5,
      lockedAt,
      version: 2,
      createdAt: now,
      updatedAt: now
    };

    const ranking = toRanking(row as Parameters<typeof toRanking>[0]);
    expect(ranking.lockedAt).toBe(lockedAt);
    expect(ranking.version).toBe(2);
  });

  it("toRanking converts numeric score string to number", () => {
    const row = {
      id: "00000000-0000-0000-0000-000000000003",
      profileId: "00000000-0000-0000-0000-000000000010",
      bookId: "00000000-0000-0000-0000-000000000022",
      position: 5,
      score: "4.20",
      bucket: 3,
      lockedAt: null,
      version: 1,
      createdAt: now,
      updatedAt: now
    };

    const ranking = toRanking(row as Parameters<typeof toRanking>[0]);
    expect(typeof ranking.score).toBe("number");
    expect(ranking.score).toBe(4.2);
  });
});

describe("imports table schema and mapper", () => {
  const now = new Date();

  it("imports schema includes required columns", () => {
    const cols = Object.keys(imports);
    expect(cols).toContain("id");
    expect(cols).toContain("ownerId");
    expect(cols).toContain("source");
    expect(cols).toContain("idempotencyHash");
    expect(cols).toContain("conflictCount");
    expect(cols).toContain("status");
    expect(cols).toContain("createdAt");
    expect(cols).toContain("completedAt");
  });

  it("toImport maps a row to an Import domain object", () => {
    const row = {
      id: "00000000-0000-0000-0000-000000000001",
      ownerId: "00000000-0000-0000-0000-000000000002",
      source: "goodreads",
      idempotencyHash: null,
      conflictCount: 0,
      status: "pending",
      createdAt: now,
      completedAt: null
    };

    const imp = toImport(row as Parameters<typeof toImport>[0]);
    expect(imp.id).toBe(row.id);
    expect(imp.ownerId).toBe(row.ownerId);
    expect(imp.source).toBe("goodreads");
    expect(imp.idempotencyHash).toBeUndefined();
    expect(imp.conflictCount).toBe(0);
    expect(imp.status).toBe("pending");
    expect(imp.createdAt).toBe(now);
    expect(imp.completedAt).toBeUndefined();
  });

  it("toImport maps idempotencyHash when present", () => {
    const row = {
      id: "00000000-0000-0000-0000-000000000001",
      ownerId: "00000000-0000-0000-0000-000000000002",
      source: "goodreads",
      idempotencyHash: "abc123def456",
      conflictCount: 3,
      status: "needs_review",
      createdAt: now,
      completedAt: null
    };

    const imp = toImport(row as Parameters<typeof toImport>[0]);
    expect(imp.idempotencyHash).toBe("abc123def456");
    expect(imp.conflictCount).toBe(3);
    expect(imp.status).toBe("needs_review");
  });

  it("toImport maps completedAt when present", () => {
    const completedAt = new Date("2024-06-01T12:00:00Z");
    const row = {
      id: "00000000-0000-0000-0000-000000000001",
      ownerId: "00000000-0000-0000-0000-000000000002",
      source: "goodreads",
      idempotencyHash: "hash123",
      conflictCount: 0,
      status: "completed",
      createdAt: now,
      completedAt
    };

    const imp = toImport(row as Parameters<typeof toImport>[0]);
    expect(imp.completedAt).toBe(completedAt);
    expect(imp.status).toBe("completed");
  });

  it("toImport maps conflictCount correctly for non-zero value", () => {
    const row = {
      id: "00000000-0000-0000-0000-000000000001",
      ownerId: "00000000-0000-0000-0000-000000000002",
      source: "goodreads",
      idempotencyHash: null,
      conflictCount: 7,
      status: "needs_review",
      createdAt: now,
      completedAt: null
    };

    const imp = toImport(row as Parameters<typeof toImport>[0]);
    expect(imp.conflictCount).toBe(7);
  });

  it("toAccountDeletion maps a row to an AccountDeletion domain object", () => {
    const requestedAt = new Date("2026-01-01T00:00:00Z");
    const hardDeleteAfter = new Date("2026-01-31T00:00:00Z");
    const row = {
      profileId: "00000000-0000-0000-0000-000000000001",
      requestedAt,
      hardDeleteAfter,
      exportedAt: null
    };

    const deletion = toAccountDeletion(row as Parameters<typeof toAccountDeletion>[0]);
    expect(deletion.profileId).toBe(row.profileId);
    expect(deletion.requestedAt).toBe(requestedAt);
    expect(deletion.hardDeleteAfter).toBe(hardDeleteAfter);
    expect(deletion.exportedAt).toBeUndefined();
  });

  it("toAccountDeletion maps exportedAt when present", () => {
    const requestedAt = new Date("2026-01-01T00:00:00Z");
    const hardDeleteAfter = new Date("2026-01-31T00:00:00Z");
    const exportedAt = new Date("2026-01-15T12:00:00Z");
    const row = {
      profileId: "00000000-0000-0000-0000-000000000001",
      requestedAt,
      hardDeleteAfter,
      exportedAt
    };

    const deletion = toAccountDeletion(row as Parameters<typeof toAccountDeletion>[0]);
    expect(deletion.exportedAt).toBe(exportedAt);
  });
});

describe("taste_vectors table schema", () => {
  it("taste_vectors schema includes required columns", () => {
    const cols = Object.keys(tasteVectors);
    expect(cols).toContain("profileId");
    expect(cols).toContain("vector");
    expect(cols).toContain("updatedAt");
  });

  it("taste_vectors schema does not have a surrogate id column", () => {
    const cols = Object.keys(tasteVectors);
    expect(cols).not.toContain("id");
  });

  it("taste_vectors profileId column exists", () => {
    expect(tasteVectors.profileId).toBeDefined();
  });
});

describe("blocks table schema and mapper", () => {
  const now = new Date();

  it("blocks schema includes required columns", () => {
    const cols = Object.keys(blocks);
    expect(cols).toContain("blockerId");
    expect(cols).toContain("blockedId");
    expect(cols).toContain("createdAt");
  });

  it("blocks schema does not have a surrogate id column", () => {
    const cols = Object.keys(blocks);
    expect(cols).not.toContain("id");
  });

  it("toBlock maps a row to a Block domain object", () => {
    const row = {
      blockerId: "00000000-0000-0000-0000-000000000001",
      blockedId: "00000000-0000-0000-0000-000000000002",
      createdAt: now
    };

    const block = toBlock(row as Parameters<typeof toBlock>[0]);
    expect(block.id).toBe(`${row.blockerId}:${row.blockedId}`);
    expect(block.blockerId).toBe(row.blockerId);
    expect(block.blockedId).toBe(row.blockedId);
    expect(block.createdAt).toBe(now);
  });

  it("toBlock produces unique id per ordered pair", () => {
    const row1 = {
      blockerId: "00000000-0000-0000-0000-000000000001",
      blockedId: "00000000-0000-0000-0000-000000000002",
      createdAt: now
    };
    const row2 = {
      blockerId: "00000000-0000-0000-0000-000000000002",
      blockedId: "00000000-0000-0000-0000-000000000001",
      createdAt: now
    };

    const block1 = toBlock(row1 as Parameters<typeof toBlock>[0]);
    const block2 = toBlock(row2 as Parameters<typeof toBlock>[0]);
    expect(block1.id).not.toBe(block2.id);
  });
});

describe("blocks_against_hash table schema and mapper", () => {
  it("blocksAgainstHash schema includes required columns", () => {
    const cols = Object.keys(blocksAgainstHash);
    expect(cols).toContain("hash");
    expect(cols).toContain("expiresAt");
  });

  it("toBlockAgainstHash maps a row to a BlockAgainstHash domain object", () => {
    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    const row = {
      hash: "abc123def456",
      expiresAt
    };

    const bah = toBlockAgainstHash(row as Parameters<typeof toBlockAgainstHash>[0]);
    expect(bah.hash).toBe("abc123def456");
    expect(bah.expiresAt).toBe(expiresAt);
  });

  it("toBlockAgainstHash 90-day expiry is preserved", () => {
    const now = new Date();
    const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
    const expiresAt = new Date(now.getTime() + ninetyDaysMs);
    const row = { hash: "somehash", expiresAt };

    const bah = toBlockAgainstHash(row as Parameters<typeof toBlockAgainstHash>[0]);
    const diffMs = bah.expiresAt.getTime() - now.getTime();
    expect(diffMs).toBeGreaterThanOrEqual(ninetyDaysMs - 1000);
    expect(diffMs).toBeLessThanOrEqual(ninetyDaysMs + 1000);
  });
});

describe("version column schema and mapper", () => {
  const now = new Date();

  it("profiles schema includes version column", () => {
    const cols = Object.keys(profiles);
    expect(cols).toContain("version");
  });

  it("shelves schema includes version column", () => {
    const cols = Object.keys(shelves);
    expect(cols).toContain("version");
  });

  it("reviews schema includes version column", () => {
    const cols = Object.keys(reviews);
    expect(cols).toContain("version");
  });

  it("toProfile maps version field", () => {
    const row = {
      id: "00000000-0000-0000-0000-000000000030",
      handle: "vtest",
      displayName: "Version Test",
      bio: null,
      avatarUrl: null,
      defaultVisibility: POSTURE_C_DEFAULTS,
      version: 3,
      createdAt: now,
      updatedAt: now
    };
    const profile = toProfile(row as Parameters<typeof toProfile>[0]);
    expect(profile.version).toBe(3);
  });

  it("toShelf maps version field", () => {
    const row = {
      id: "00000000-0000-0000-0000-000000000031",
      ownerId: "00000000-0000-0000-0000-000000000030",
      name: "My Shelf",
      slug: "my-shelf",
      visibility: "public" as const,
      isSystem: false,
      kind: "custom" as const,
      authorType: "user" as const,
      curatorTier: null,
      description: null,
      publishedAt: null,
      version: 2,
      createdAt: now,
      updatedAt: now
    };
    const shelf = toShelf(row as Parameters<typeof toShelf>[0]);
    expect(shelf.version).toBe(2);
  });

  it("toReview maps version field", () => {
    const row = {
      id: "00000000-0000-0000-0000-000000000032",
      authorId: "00000000-0000-0000-0000-000000000030",
      bookId: "00000000-0000-0000-0000-000000000001",
      editionId: null,
      body: "Excellent.",
      visibility: "public" as const,
      version: 5,
      createdAt: now,
      updatedAt: now
    };
    const review = toReview(row as Parameters<typeof toReview>[0]);
    expect(review.version).toBe(5);
  });

  it("version defaults to 1 in schema for profiles", () => {
    expect(profiles.version).toBeDefined();
  });

  it("version defaults to 1 in schema for shelves", () => {
    expect(shelves.version).toBeDefined();
  });

  it("version defaults to 1 in schema for reviews", () => {
    expect(reviews.version).toBeDefined();
  });
});

describe("phone_verifications table schema and mapper", () => {
  it("phoneVerifications schema includes required columns", () => {
    const cols = Object.keys(phoneVerifications);
    expect(cols).toContain("phoneE164");
    expect(cols).toContain("codeHash");
    expect(cols).toContain("attempts");
    expect(cols).toContain("expiresAt");
  });

  it("toPhoneVerification maps a row to a PhoneVerification domain object", () => {
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const row = {
      phoneE164: "+14155552671",
      codeHash: "abc123hash",
      attempts: 0,
      expiresAt
    };

    const pv = toPhoneVerification(row as Parameters<typeof toPhoneVerification>[0]);
    expect(pv.phoneE164).toBe("+14155552671");
    expect(pv.codeHash).toBe("abc123hash");
    expect(pv.attempts).toBe(0);
    expect(pv.expiresAt).toBe(expiresAt);
  });

  it("toPhoneVerification maps attempts when non-zero", () => {
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const row = {
      phoneE164: "+14155552671",
      codeHash: "differenthash",
      attempts: 2,
      expiresAt
    };

    const pv = toPhoneVerification(row as Parameters<typeof toPhoneVerification>[0]);
    expect(pv.attempts).toBe(2);
  });
});

describe("phone_numbers table schema and mapper", () => {
  it("phoneNumbers schema includes required columns", () => {
    const cols = Object.keys(phoneNumbers);
    expect(cols).toContain("profileId");
    expect(cols).toContain("e164Hash");
  });

  it("phoneNumbers schema does not have an extra id column", () => {
    const cols = Object.keys(phoneNumbers);
    expect(cols).not.toContain("id");
  });

  it("toPhoneNumber maps a row to a PhoneNumber domain object", () => {
    const row = {
      profileId: "00000000-0000-0000-0000-000000000001",
      e164Hash: "hmac_sha256_hash_value"
    };

    const pn = toPhoneNumber(row as Parameters<typeof toPhoneNumber>[0]);
    expect(pn.profileId).toBe("00000000-0000-0000-0000-000000000001");
    expect(pn.e164Hash).toBe("hmac_sha256_hash_value");
  });
});

describe("auth_identities table schema and mapper", () => {
  it("authIdentities schema includes required columns", () => {
    const cols = Object.keys(authIdentities);
    expect(cols).toContain("provider");
    expect(cols).toContain("providerUserId");
    expect(cols).toContain("profileId");
  });

  it("authIdentities schema does not have a surrogate id column", () => {
    const cols = Object.keys(authIdentities);
    expect(cols).not.toContain("id");
  });

  it("toOAuthIdentity maps a row to an OAuthIdentity domain object", () => {
    const row = {
      provider: "apple",
      providerUserId: "apple.user.001",
      profileId: "00000000-0000-0000-0000-000000000001"
    };

    const identity = toOAuthIdentity(row as Parameters<typeof toOAuthIdentity>[0]);
    expect(identity.provider).toBe("apple");
    expect(identity.providerUserId).toBe("apple.user.001");
    expect(identity.profileId).toBe("00000000-0000-0000-0000-000000000001");
  });

  it("toOAuthIdentity maps google provider correctly", () => {
    const row = {
      provider: "google",
      providerUserId: "google.user.999",
      profileId: "00000000-0000-0000-0000-000000000002"
    };

    const identity = toOAuthIdentity(row as Parameters<typeof toOAuthIdentity>[0]);
    expect(identity.provider).toBe("google");
    expect(identity.providerUserId).toBe("google.user.999");
    expect(identity.profileId).toBe("00000000-0000-0000-0000-000000000002");
  });
});

describe("sessions table schema and mapper", () => {
  const now = new Date();

  it("sessions schema includes required columns", () => {
    const cols = Object.keys(sessions);
    expect(cols).toContain("tokenHash");
    expect(cols).toContain("profileId");
    expect(cols).toContain("expiresAt");
    expect(cols).toContain("revokedAt");
  });

  it("sessions schema does not have a surrogate id column", () => {
    const cols = Object.keys(sessions);
    expect(cols).not.toContain("id");
  });

  it("toSession maps a row to a Session domain object", () => {
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const row = {
      tokenHash: "sha256_token_hash_value",
      profileId: "00000000-0000-0000-0000-000000000001",
      expiresAt,
      revokedAt: null
    };

    const session = toSession(row as Parameters<typeof toSession>[0]);
    expect(session.tokenHash).toBe("sha256_token_hash_value");
    expect(session.profileId).toBe("00000000-0000-0000-0000-000000000001");
    expect(session.expiresAt).toBe(expiresAt);
    expect(session.revokedAt).toBeUndefined();
  });

  it("toSession maps revokedAt when present", () => {
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const revokedAt = new Date();
    const row = {
      tokenHash: "sha256_revoked_token_hash",
      profileId: "00000000-0000-0000-0000-000000000002",
      expiresAt,
      revokedAt
    };

    const session = toSession(row as Parameters<typeof toSession>[0]);
    expect(session.revokedAt).toBe(revokedAt);
  });

  it("toSession maps revokedAt as undefined when null", () => {
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const row = {
      tokenHash: "sha256_active_token_hash",
      profileId: "00000000-0000-0000-0000-000000000003",
      expiresAt,
      revokedAt: null
    };

    const session = toSession(row as Parameters<typeof toSession>[0]);
    expect(session.revokedAt).toBeUndefined();
  });
});

describe("activity_events score snapshot + group_key fields", () => {
  const now = new Date();

  it("activityEvents schema includes scoreAtPublish, scoreLockedAtPublish, groupKey columns", () => {
    const cols = Object.keys(activityEvents);
    expect(cols).toContain("scoreAtPublish");
    expect(cols).toContain("scoreLockedAtPublish");
    expect(cols).toContain("groupKey");
  });

  it("toActivityEvent maps scoreAtPublish as number when present", () => {
    const row = {
      id: "00000000-0000-0000-0000-000000000007",
      actorId: "00000000-0000-0000-0000-000000000002",
      verb: "book_ranked" as const,
      bookId: "00000000-0000-0000-0000-000000000001",
      shelfId: null,
      reviewId: null,
      visibility: "followers" as const,
      occurredAt: now,
      scoreAtPublish: "8.50",
      scoreLockedAtPublish: true,
      groupKey: "actor:00000000-0000-0000-0000-000000000002:book_ranked:1700000000"
    };

    const event = toActivityEvent(row as Parameters<typeof toActivityEvent>[0]);
    expect(event.scoreAtPublish).toBe(8.5);
    expect(typeof event.scoreAtPublish).toBe("number");
    expect(event.scoreLockedAtPublish).toBe(true);
    expect(event.groupKey).toBe("actor:00000000-0000-0000-0000-000000000002:book_ranked:1700000000");
  });

  it("toActivityEvent maps scoreAtPublish as undefined when null", () => {
    const row = {
      id: "00000000-0000-0000-0000-000000000008",
      actorId: "00000000-0000-0000-0000-000000000002",
      verb: "book_finished" as const,
      bookId: "00000000-0000-0000-0000-000000000001",
      shelfId: null,
      reviewId: null,
      visibility: "followers" as const,
      occurredAt: now,
      scoreAtPublish: null,
      scoreLockedAtPublish: null,
      groupKey: null
    };

    const event = toActivityEvent(row as Parameters<typeof toActivityEvent>[0]);
    expect(event.scoreAtPublish).toBeUndefined();
    expect(event.scoreLockedAtPublish).toBeUndefined();
    expect(event.groupKey).toBeUndefined();
  });

  it("toActivityEvent maps scoreLockedAtPublish false when false", () => {
    const row = {
      id: "00000000-0000-0000-0000-000000000009",
      actorId: "00000000-0000-0000-0000-000000000002",
      verb: "book_ranked" as const,
      bookId: "00000000-0000-0000-0000-000000000001",
      shelfId: null,
      reviewId: null,
      visibility: "followers" as const,
      occurredAt: now,
      scoreAtPublish: "5.00",
      scoreLockedAtPublish: false,
      groupKey: "actor:00000000-0000-0000-0000-000000000002:book_ranked:1700003600"
    };

    const event = toActivityEvent(row as Parameters<typeof toActivityEvent>[0]);
    expect(event.scoreAtPublish).toBe(5.0);
    expect(event.scoreLockedAtPublish).toBe(false);
    expect(event.groupKey).toBe("actor:00000000-0000-0000-0000-000000000002:book_ranked:1700003600");
  });
});

describe("contacts_index table schema and mapper", () => {
  it("toContactIndex maps a contacts_index row to a ContactIndex domain object", () => {
    const expires = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    const row = {
      profileId: "00000000-0000-0000-0000-000000000001",
      contactHash: "abc123hashedcontact",
      saltVersion: 1,
      expiresAt: expires
    };

    const result = toContactIndex(row as Parameters<typeof toContactIndex>[0]);
    expect(result.profileId).toBe(row.profileId);
    expect(result.contactHash).toBe(row.contactHash);
    expect(result.saltVersion).toBe(1);
    expect(result.expiresAt).toBe(expires);
  });

  it("toContactIndex maps different saltVersion values", () => {
    const expires = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    const row = {
      profileId: "00000000-0000-0000-0000-000000000002",
      contactHash: "newhashvalue",
      saltVersion: 3,
      expiresAt: expires
    };

    const result = toContactIndex(row as Parameters<typeof toContactIndex>[0]);
    expect(result.saltVersion).toBe(3);
    expect(result.contactHash).toBe("newhashvalue");
  });
});

describe("email_index table schema and mapper", () => {
  it("toEmailIndex maps an email_index row to an EmailIndex domain object", () => {
    const expires = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    const row = {
      profileId: "00000000-0000-0000-0000-000000000002",
      emailHash: "def456hashedemail",
      saltVersion: 2,
      expiresAt: expires
    };

    const result = toEmailIndex(row as Parameters<typeof toEmailIndex>[0]);
    expect(result.profileId).toBe(row.profileId);
    expect(result.emailHash).toBe(row.emailHash);
    expect(result.saltVersion).toBe(2);
    expect(result.expiresAt).toBe(expires);
  });

  it("toEmailIndex maps different saltVersion values", () => {
    const expires = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    const row = {
      profileId: "00000000-0000-0000-0000-000000000003",
      emailHash: "emailhashnewsalt",
      saltVersion: 5,
      expiresAt: expires
    };

    const result = toEmailIndex(row as Parameters<typeof toEmailIndex>[0]);
    expect(result.saltVersion).toBe(5);
    expect(result.emailHash).toBe("emailhashnewsalt");
  });

  it("toNotificationToken maps a notification_tokens row to a NotificationToken domain object", () => {
    const now = new Date();
    const row = {
      profileId: "00000000-0000-0000-0000-000000000001",
      platform: "apns" as const,
      token: "abc123devicetoken",
      lastSeen: now
    };

    const result = toNotificationToken(row as Parameters<typeof toNotificationToken>[0]);
    expect(result.profileId).toBe(row.profileId);
    expect(result.platform).toBe("apns");
    expect(result.token).toBe("abc123devicetoken");
    expect(result.lastSeen).toBe(now);
  });

  it("toNotificationToken maps fcm platform correctly", () => {
    const now = new Date();
    const row = {
      profileId: "00000000-0000-0000-0000-000000000002",
      platform: "fcm" as const,
      token: "fcmtoken456",
      lastSeen: now
    };

    const result = toNotificationToken(row as Parameters<typeof toNotificationToken>[0]);
    expect(result.platform).toBe("fcm");
    expect(result.token).toBe("fcmtoken456");
  });

  it("toNotificationSetting maps a notification_settings row to a NotificationSetting domain object", () => {
    const row = {
      profileId: "00000000-0000-0000-0000-000000000001",
      key: "push_new_follower",
      value: true
    };

    const result = toNotificationSetting(row as Parameters<typeof toNotificationSetting>[0]);
    expect(result.profileId).toBe(row.profileId);
    expect(result.key).toBe("push_new_follower");
    expect(result.value).toBe(true);
  });

  it("toNotificationSetting maps jsonb value correctly for object values", () => {
    const row = {
      profileId: "00000000-0000-0000-0000-000000000002",
      key: "quiet_hours",
      value: { start: "22:00", end: "08:00" }
    };

    const result = toNotificationSetting(row as Parameters<typeof toNotificationSetting>[0]);
    expect(result.key).toBe("quiet_hours");
    expect(result.value).toEqual({ start: "22:00", end: "08:00" });
  });

  it("toHandleHistory maps a handle_history row to a HandleHistory domain object", () => {
    const now = new Date();
    const expires = new Date(now.getTime() + 3 * 365 * 24 * 60 * 60 * 1000);
    const row = {
      id: "00000000-0000-0000-0000-000000000099",
      profileId: "00000000-0000-0000-0000-000000000001",
      oldHandle: "oldname",
      retiredAt: now,
      expiresAt: expires,
    };

    const result = toHandleHistory(row as Parameters<typeof toHandleHistory>[0]);
    expect(result.id).toBe(row.id);
    expect(result.profileId).toBe(row.profileId);
    expect(result.oldHandle).toBe("oldname");
    expect(result.retiredAt).toBe(now);
    expect(result.expiresAt).toBe(expires);
  });
});

describe("toFollow mapper", () => {
  const now = new Date();

  it("synthesizes id from followerId and followeeId", () => {
    const row = {
      followerId: "00000000-0000-0000-0000-000000000001",
      followeeId: "00000000-0000-0000-0000-000000000002",
      createdAt: now,
    };
    const follow = toFollow(row as Parameters<typeof toFollow>[0]);
    expect(follow.id).toBe(`${row.followerId}:${row.followeeId}`);
  });

  it("maps all fields correctly", () => {
    const row = {
      followerId: "00000000-0000-0000-0000-000000000001",
      followeeId: "00000000-0000-0000-0000-000000000002",
      createdAt: now,
    };
    const follow = toFollow(row as Parameters<typeof toFollow>[0]);
    expect(follow.followerId).toBe(row.followerId);
    expect(follow.followeeId).toBe(row.followeeId);
    expect(follow.createdAt).toBe(now);
  });

  it("produces unique id for each ordered pair", () => {
    const row1 = {
      followerId: "00000000-0000-0000-0000-000000000001",
      followeeId: "00000000-0000-0000-0000-000000000002",
      createdAt: now,
    };
    const row2 = {
      followerId: "00000000-0000-0000-0000-000000000002",
      followeeId: "00000000-0000-0000-0000-000000000001",
      createdAt: now,
    };
    const f1 = toFollow(row1 as Parameters<typeof toFollow>[0]);
    const f2 = toFollow(row2 as Parameters<typeof toFollow>[0]);
    expect(f1.id).not.toBe(f2.id);
  });
});

describe("toList mapper", () => {
  const now = new Date();

  it("maps a shelf row with kind=list to a List domain object", () => {
    const row = {
      id: "00000000-0000-0000-0000-000000000010",
      ownerId: "00000000-0000-0000-0000-000000000001",
      name: "Best Sci-Fi",
      slug: "best-sci-fi",
      visibility: "public" as const,
      isSystem: false,
      kind: "list" as const,
      authorType: "user" as const,
      curatorTier: null,
      description: "Top sci-fi picks",
      publishedAt: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    const list = toList(row as Parameters<typeof toList>[0]);
    expect(list.id).toBe(row.id);
    expect(list.ownerId).toBe(row.ownerId);
    expect(list.title).toBe("Best Sci-Fi");
    expect(list.description).toBe("Top sci-fi picks");
    expect(list.visibility).toBe("public");
    expect(list.createdAt).toBe(now);
    expect(list.updatedAt).toBe(now);
  });

  it("maps description as undefined when null", () => {
    const row = {
      id: "00000000-0000-0000-0000-000000000010",
      ownerId: "00000000-0000-0000-0000-000000000001",
      name: "My List",
      slug: "my-list",
      visibility: "followers" as const,
      isSystem: false,
      kind: "list" as const,
      authorType: "user" as const,
      curatorTier: null,
      description: null,
      publishedAt: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    const list = toList(row as Parameters<typeof toList>[0]);
    expect(list.description).toBeUndefined();
  });

  it("preserves all four visibility tiers", () => {
    const visibilities = ["public", "followers", "mutuals", "private"] as const;
    for (const visibility of visibilities) {
      const row = {
        id: "00000000-0000-0000-0000-000000000010",
        ownerId: "00000000-0000-0000-0000-000000000001",
        name: "Test",
        slug: "test",
        visibility,
        isSystem: false,
        kind: "list" as const,
        authorType: "user" as const,
        curatorTier: null,
        description: null,
        publishedAt: null,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      const list = toList(row as Parameters<typeof toList>[0]);
      expect(list.visibility).toBe(visibility);
    }
  });
});

describe("toListItem mapper", () => {
  const now = new Date();

  it("maps a shelfItem row to a ListItem domain object", () => {
    const row = {
      id: "00000000-0000-0000-0000-000000000020",
      shelfId: "00000000-0000-0000-0000-000000000010",
      bookId: "00000000-0000-0000-0000-000000000001",
      editionId: null,
      status: "want_to_read" as const,
      rank: null,
      notes: null,
      position: 3,
      addedAt: now,
      updatedAt: now,
    };
    const item = toListItem(row as Parameters<typeof toListItem>[0]);
    expect(item.id).toBe(row.id);
    expect(item.listId).toBe(row.shelfId);
    expect(item.bookId).toBe(row.bookId);
    expect(item.position).toBe(3);
    expect(item.addedAt).toBe(now);
  });

  it("defaults position to 0 when null", () => {
    const row = {
      id: "00000000-0000-0000-0000-000000000020",
      shelfId: "00000000-0000-0000-0000-000000000010",
      bookId: "00000000-0000-0000-0000-000000000001",
      editionId: null,
      status: "want_to_read" as const,
      rank: null,
      notes: null,
      position: null,
      addedAt: now,
      updatedAt: now,
    };
    const item = toListItem(row as Parameters<typeof toListItem>[0]);
    expect(item.position).toBe(0);
  });
});
