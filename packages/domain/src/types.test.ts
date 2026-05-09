import { describe, it, expect } from "vitest";
import type { Visibility, ReadingStatus, Profile, Book } from "./types";

describe("domain types smoke test", () => {
  it("Visibility type accepts valid values", () => {
    const values: Visibility[] = ["private", "friends", "public"];
    expect(values).toHaveLength(3);
  });

  it("ReadingStatus type accepts valid values", () => {
    const values: ReadingStatus[] = [
      "want_to_read",
      "reading",
      "finished",
      "dropped"
    ];
    expect(values).toHaveLength(4);
  });

  it("Profile shape is structurally valid", () => {
    const now = new Date();
    const profile: Profile = {
      id: "00000000-0000-0000-0000-000000000001",
      handle: "tester",
      displayName: "Test User",
      defaultVisibility: "public",
      createdAt: now,
      updatedAt: now
    };
    expect(profile.handle).toBe("tester");
    expect(profile.defaultVisibility).toBe("public");
  });

  it("Book shape is structurally valid", () => {
    const now = new Date();
    const book: Book = {
      id: "00000000-0000-0000-0000-000000000002",
      canonicalTitle: "The Great Gatsby",
      createdAt: now,
      updatedAt: now
    };
    expect(book.canonicalTitle).toBe("The Great Gatsby");
  });
});
