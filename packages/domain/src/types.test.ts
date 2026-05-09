import { describe, it, expect } from "vitest";
import type {
  Book,
  ContentType,
  Profile,
  ReadingStatus,
  Visibility,
} from "./types";

// Compile-time assertions for the Posture C 4-tier model.

type IsExact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;

type _VisibilityIsFourTier = Assert<
  IsExact<Visibility, "public" | "followers" | "mutuals" | "private">
>;

type _ContentTypeCoversAllItems = Assert<
  IsExact<
    ContentType,
    | "identity"
    | "follower_list"
    | "review"
    | "score"
    | "finished_shelf"
    | "custom_shelf"
    | "want_to_read_shelf"
    | "reading_shelf"
    | "dropped_shelf"
    | "reading_status"
    | "activity_stream"
  >
>;

type _ProfileDefaultVisibilityIsVisibility = Assert<
  IsExact<Profile["defaultVisibility"], Visibility>
>;

export type {
  _VisibilityIsFourTier,
  _ContentTypeCoversAllItems,
  _ProfileDefaultVisibilityIsVisibility,
};

// Runtime smoke tests against the same types.

describe("domain types smoke test", () => {
  it("Visibility type accepts the four Posture C tiers", () => {
    const values: Visibility[] = ["public", "followers", "mutuals", "private"];
    expect(values).toHaveLength(4);
  });

  it("ReadingStatus type accepts valid values", () => {
    const values: ReadingStatus[] = [
      "want_to_read",
      "reading",
      "finished",
      "dropped",
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
      updatedAt: now,
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
      updatedAt: now,
    };
    expect(book.canonicalTitle).toBe("The Great Gatsby");
  });
});
