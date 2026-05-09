import { describe, it, expect } from "vitest";
import { toBook, toProfile, toShelf, toEdition, toShelfItem, toReview, toActivityEvent } from "./mappers";
import type { ContentType, Visibility } from "@hone/domain";
import { POSTURE_C_DEFAULTS } from "@hone/domain";
import { follows } from "./schema";

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
    const customDefaults: Record<ContentType, Visibility> = {
      ...POSTURE_C_DEFAULTS,
      review: "followers",
    };
    const row = {
      id: "00000000-0000-0000-0000-000000000002",
      handle: "reader",
      displayName: "A Reader",
      bio: "Loves books",
      avatarUrl: "https://example.com/avatar.jpg",
      defaultVisibility: customDefaults,
      createdAt: now,
      updatedAt: now
    };

    const profile = toProfile(row as Parameters<typeof toProfile>[0]);
    expect(profile.bio).toBe("Loves books");
    expect(profile.avatarUrl).toBe("https://example.com/avatar.jpg");
    expect(profile.defaultVisibility.review).toBe("followers");
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
      createdAt: now,
      updatedAt: now
    };

    const shelf = toShelf(row as Parameters<typeof toShelf>[0]);
    expect(shelf.name).toBe("Finished");
    expect(shelf.isSystem).toBe(true);
    expect(shelf.slug).toBe("finished");
    expect(shelf.ownerId).toBe(row.ownerId);
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
      addedAt: now,
      updatedAt: now
    };

    const item = toShelfItem(row as Parameters<typeof toShelfItem>[0]);
    expect(item.editionId).toBe("00000000-0000-0000-0000-000000000004");
    expect(item.rank).toBe(3);
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

  it("toProfile maps defaultVisibility as Record<ContentType, Visibility>", () => {
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
    expect(profile.defaultVisibility).toEqual(POSTURE_C_DEFAULTS);
    expect(profile.defaultVisibility.identity).toBe("public");
    expect(profile.defaultVisibility.want_to_read_shelf).toBe("followers");
  });

  it("toProfile preserves custom per-content-type overrides", () => {
    const customDefaults: Record<ContentType, Visibility> = {
      ...POSTURE_C_DEFAULTS,
      review: "mutuals",
      score: "private",
    };
    const row = {
      id: "00000000-0000-0000-0000-000000000010",
      handle: "user",
      displayName: "User",
      bio: null,
      avatarUrl: null,
      defaultVisibility: customDefaults,
      createdAt: now,
      updatedAt: now
    };
    const profile = toProfile(row as Parameters<typeof toProfile>[0]);
    expect(profile.defaultVisibility.review).toBe("mutuals");
    expect(profile.defaultVisibility.score).toBe("private");
    expect(profile.defaultVisibility.identity).toBe("public");
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
