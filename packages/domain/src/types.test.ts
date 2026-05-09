import { describe, it, expect } from "vitest";
import type {
  Block,
  Book,
  ContactsHash,
  ContentType,
  Follow,
  Import,
  ImportSource,
  ImportStatus,
  List,
  ListItem,
  NotificationPlatform,
  NotificationToken,
  Profile,
  Ranking,
  ReadingStatus,
  Session,
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

type _ImportStatusIsExhaustive = Assert<
  IsExact<
    ImportStatus,
    "pending" | "processing" | "needs_review" | "completed" | "failed"
  >
>;

type _ImportSourceIsExhaustive = Assert<
  IsExact<ImportSource, "goodreads" | "manual">
>;

type _NotificationPlatformIsExhaustive = Assert<
  IsExact<NotificationPlatform, "apns" | "fcm">
>;

type _FollowHasRequiredFields = Assert<
  IsExact<
    keyof Follow,
    "id" | "followerId" | "followeeId" | "createdAt"
  >
>;

type _BlockHasRequiredFields = Assert<
  IsExact<
    keyof Block,
    "id" | "blockerId" | "blockedId" | "createdAt"
  >
>;

export type {
  _VisibilityIsFourTier,
  _ContentTypeCoversAllItems,
  _ProfileDefaultVisibilityIsVisibility,
  _ImportStatusIsExhaustive,
  _ImportSourceIsExhaustive,
  _NotificationPlatformIsExhaustive,
  _FollowHasRequiredFields,
  _BlockHasRequiredFields,
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
      version: 1,
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

  it("Follow shape is structurally valid", () => {
    const now = new Date();
    const follow: Follow = {
      id: "00000000-0000-0000-0000-000000000010",
      followerId: "00000000-0000-0000-0000-000000000001",
      followeeId: "00000000-0000-0000-0000-000000000002",
      createdAt: now,
    };
    expect(follow.followerId).not.toBe(follow.followeeId);
  });

  it("Block shape is structurally valid", () => {
    const now = new Date();
    const block: Block = {
      id: "00000000-0000-0000-0000-000000000011",
      blockerId: "00000000-0000-0000-0000-000000000001",
      blockedId: "00000000-0000-0000-0000-000000000002",
      createdAt: now,
    };
    expect(block.blockerId).not.toBe(block.blockedId);
  });

  it("Ranking shape is structurally valid", () => {
    const now = new Date();
    const ranking: Ranking = {
      id: "00000000-0000-0000-0000-000000000012",
      profileId: "00000000-0000-0000-0000-000000000001",
      bookId: "00000000-0000-0000-0000-000000000002",
      position: 1,
      score: 9.5,
      bucket: 5,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    expect(ranking.position).toBeGreaterThan(0);
    expect(ranking.score).toBeGreaterThanOrEqual(0);
    expect(ranking.score).toBeLessThanOrEqual(10);
  });

  it("List shape is structurally valid", () => {
    const now = new Date();
    const list: List = {
      id: "00000000-0000-0000-0000-000000000013",
      ownerId: "00000000-0000-0000-0000-000000000001",
      title: "My Favourite Books",
      visibility: "public",
      createdAt: now,
      updatedAt: now,
    };
    expect(list.title).toBe("My Favourite Books");
    expect(list.visibility).toBe("public");
  });

  it("ListItem shape is structurally valid", () => {
    const now = new Date();
    const listItem: ListItem = {
      id: "00000000-0000-0000-0000-000000000014",
      listId: "00000000-0000-0000-0000-000000000013",
      bookId: "00000000-0000-0000-0000-000000000002",
      position: 1,
      addedAt: now,
    };
    expect(listItem.position).toBeGreaterThan(0);
  });

  it("NotificationToken shape is structurally valid", () => {
    const now = new Date();
    const token: NotificationToken = {
      id: "00000000-0000-0000-0000-000000000015",
      userId: "00000000-0000-0000-0000-000000000001",
      platform: "apns",
      token: "abc123devicetoken",
      createdAt: now,
      updatedAt: now,
    };
    expect(token.platform).toBe("apns");
  });

  it("Import shape is structurally valid", () => {
    const now = new Date();
    const importRecord: Import = {
      id: "00000000-0000-0000-0000-000000000016",
      ownerId: "00000000-0000-0000-0000-000000000001",
      source: "goodreads",
      conflictCount: 0,
      status: "pending",
      createdAt: now,
    };
    expect(importRecord.source).toBe("goodreads");
    expect(importRecord.status).toBe("pending");
  });

  it("ImportStatus covers all states", () => {
    const values: ImportStatus[] = [
      "pending",
      "processing",
      "needs_review",
      "completed",
      "failed",
    ];
    expect(values).toHaveLength(5);
  });

  it("ContactsHash shape is structurally valid", () => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    const contactsHash: ContactsHash = {
      id: "00000000-0000-0000-0000-000000000017",
      userId: "00000000-0000-0000-0000-000000000001",
      hash: "abc123hashedphone",
      saltVersion: 1,
      createdAt: now,
      expiresAt,
    };
    expect(contactsHash.saltVersion).toBeGreaterThan(0);
    expect(contactsHash.expiresAt.getTime()).toBeGreaterThan(contactsHash.createdAt.getTime());
  });

  it("Session shape is structurally valid", () => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const session: Session = {
      id: "00000000-0000-0000-0000-000000000018",
      userId: "00000000-0000-0000-0000-000000000001",
      createdAt: now,
      expiresAt,
    };
    expect(session.expiresAt.getTime()).toBeGreaterThan(session.createdAt.getTime());
  });

  it("NotificationPlatform accepts apns and fcm", () => {
    const values: NotificationPlatform[] = ["apns", "fcm"];
    expect(values).toHaveLength(2);
  });
});
