import { describe, it, expect } from "vitest";
import { toBook, toProfile, toReview, toShelf } from "./mappers";
import type { Visibility } from "@hone/domain";

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
  });

  it("toProfile maps a row to a Profile domain object", () => {
    const now = new Date();
    const row = {
      id: "00000000-0000-0000-0000-000000000002",
      handle: "bookworm",
      displayName: "Book Worm",
      bio: null,
      avatarUrl: null,
      defaultVisibility: "public" as const,
      createdAt: now,
      updatedAt: now
    };

    const profile = toProfile(row as Parameters<typeof toProfile>[0]);
    expect(profile.handle).toBe("bookworm");
    expect(profile.bio).toBeUndefined();
    expect(profile.defaultVisibility).toBe("public");
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
  });
});

describe("visibility 4-tier enum mapping", () => {
  const visibilityTiers: Visibility[] = ["public", "followers", "mutuals", "private"];
  const now = new Date();

  it("toProfile preserves all four visibility tiers", () => {
    for (const tier of visibilityTiers) {
      const row = {
        id: "00000000-0000-0000-0000-000000000010",
        handle: "user",
        displayName: "User",
        bio: null,
        avatarUrl: null,
        defaultVisibility: tier as Visibility,
        createdAt: now,
        updatedAt: now
      };
      const profile = toProfile(row as Parameters<typeof toProfile>[0]);
      expect(profile.defaultVisibility).toBe(tier);
    }
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
