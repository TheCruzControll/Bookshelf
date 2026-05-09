import { describe, it, expect } from "vitest";
import {
  buildProfileMeta,
  buildShelfMeta,
  buildReviewMeta,
  buildListMeta,
  buildBookMeta,
} from "./og-meta";

describe("buildProfileMeta", () => {
  it("includes openGraph title and description when profile exists", () => {
    const meta = buildProfileMeta("maya", {
      displayName: "Maya",
      bio: "Reader",
    });
    expect(meta.title).toBe("Maya (@maya) — Hone");
    expect(meta.description).toBe("Reader");
    expect((meta.openGraph as { title: string }).title).toBe("Maya (@maya) — Hone");
  });

  it("falls back to handle when profile is null", () => {
    const meta = buildProfileMeta("maya", null);
    expect(meta.title).toBe("@maya — Hone");
    expect(meta.description).toBe("maya's reading profile on Hone.");
  });

  it("uses default description when bio is absent", () => {
    const meta = buildProfileMeta("maya", { displayName: "Maya" });
    expect(meta.description).toBe("maya's reading profile on Hone.");
    expect((meta.twitter as { card: string }).card).toBe("summary");
  });

  it("includes image and summary_large_image card when avatarUrl is present", () => {
    const meta = buildProfileMeta("maya", {
      displayName: "Maya",
      avatarUrl: "https://example.com/avatar.jpg",
    });
    const og = meta.openGraph as { images?: Array<{ url: string }> };
    expect(og.images).toEqual([{ url: "https://example.com/avatar.jpg" }]);
    expect((meta.twitter as { card: string }).card).toBe("summary_large_image");
  });

  it("omits image and uses summary card when avatarUrl is absent", () => {
    const meta = buildProfileMeta("maya", { displayName: "Maya" });
    const og = meta.openGraph as { images?: unknown };
    expect(og.images).toBeUndefined();
    expect((meta.twitter as { card: string }).card).toBe("summary");
  });
});

describe("buildShelfMeta", () => {
  it("uses shelf name in title when shelf exists", () => {
    const meta = buildShelfMeta("maya", "favorites", { name: "Favorites", description: "My fav books" });
    expect(meta.title).toBe("Favorites — @maya — Hone");
    expect(meta.description).toBe("My fav books");
  });

  it("falls back to slug and default description when shelf is null", () => {
    const meta = buildShelfMeta("maya", "favorites", null);
    expect(meta.title).toBe("favorites — @maya — Hone");
    expect(meta.description).toBe("maya's shelf on Hone.");
  });

  it("includes openGraph and twitter summary card", () => {
    const meta = buildShelfMeta("maya", "favorites", null);
    expect(meta.openGraph).toBeDefined();
    expect(meta.twitter).toBeDefined();
    expect((meta.twitter as { card: string }).card).toBe("summary");
  });
});

describe("buildReviewMeta", () => {
  it("includes book title when review has book", () => {
    const meta = buildReviewMeta("maya", {
      body: "A wonderful read.",
      book: { canonicalTitle: "Dune" },
    });
    expect(meta.title).toBe("Dune — Review by @maya — Hone");
    expect(meta.description).toBe("A wonderful read.");
  });

  it("truncates description to 160 chars", () => {
    const longBody = "x".repeat(200);
    const meta = buildReviewMeta("maya", { body: longBody });
    expect((meta.description as string).length).toBe(160);
  });

  it("falls back when review is null", () => {
    const meta = buildReviewMeta("maya", null);
    expect(meta.title).toBe("Review by @maya — Hone");
    expect(meta.description).toBe("A book review by maya on Hone.");
  });

  it("includes image and summary_large_image when book has coverUrl", () => {
    const meta = buildReviewMeta("maya", {
      body: "Great.",
      book: { canonicalTitle: "Dune", coverUrl: "https://example.com/dune.jpg" },
    });
    const og = meta.openGraph as { images?: Array<{ url: string }> };
    expect(og.images).toEqual([{ url: "https://example.com/dune.jpg" }]);
    expect((meta.twitter as { card: string }).card).toBe("summary_large_image");
  });
});

describe("buildListMeta", () => {
  it("uses list title when list exists", () => {
    const meta = buildListMeta("maya", { title: "Sci-Fi Picks", description: "My favorites" });
    expect(meta.title).toBe("Sci-Fi Picks — @maya — Hone");
    expect(meta.description).toBe("My favorites");
  });

  it("falls back when list is null", () => {
    const meta = buildListMeta("maya", null);
    expect(meta.title).toBe("List — @maya — Hone");
    expect(meta.description).toBe("A list by maya on Hone.");
  });
});

describe("buildBookMeta", () => {
  it("uses book title and description when book exists", () => {
    const meta = buildBookMeta({ canonicalTitle: "Dune", description: "Epic sci-fi" });
    expect(meta.title).toBe("Dune — Hone");
    expect(meta.description).toBe("Epic sci-fi");
  });

  it("falls back when book is null", () => {
    const meta = buildBookMeta(null);
    expect(meta.title).toBe("Book Detail — Hone");
    expect(meta.description).toBe("Buy and read this book through your preferred retailer.");
  });

  it("includes image and summary_large_image when book has coverUrl", () => {
    const meta = buildBookMeta({ canonicalTitle: "Dune", coverUrl: "https://example.com/cover.jpg" });
    const og = meta.openGraph as { images?: Array<{ url: string }> };
    expect(og.images).toEqual([{ url: "https://example.com/cover.jpg" }]);
    expect((meta.twitter as { card: string }).card).toBe("summary_large_image");
  });

  it("uses summary card and no image when coverUrl is absent", () => {
    const meta = buildBookMeta({ canonicalTitle: "Dune" });
    const og = meta.openGraph as { images?: unknown };
    expect(og.images).toBeUndefined();
    expect((meta.twitter as { card: string }).card).toBe("summary");
  });
});
