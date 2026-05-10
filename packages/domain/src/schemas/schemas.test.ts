import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  EntityIdSchema,
  AuthIdentitySchema,
  SessionSchema,
} from "./auth";
import {
  VisibilitySchema,
  ProfileSchema,
  CreateProfileInputSchema,
  FollowSchema,
  BlockSchema,
} from "./profiles";
import {
  ReadingStatusSchema,
  BookSchema,
  EditionSchema,
  CreateShelfInputSchema,
  AddShelfItemInputSchema,
} from "./shelves";
import {
  RankingSchema,
  ReviewSchema,
  CreateReviewInputSchema,
  StartBucketInputSchema,
} from "./ranking";
import {
  ActivityVerbSchema,
  FeedCursorSchema,
} from "./feed";
import { RecommendationSchema, RecsQuerySchema } from "./recs";
import {
  ListSchema,
  CreateListInputSchema,
  AddListItemInputSchema,
} from "./lists";
import {
  NotificationPlatformSchema,
  NotificationSettingSchema,
  NotificationTokenSchema,
  RegisterTokenInputSchema,
} from "./notifications";

const UUID = "00000000-0000-0000-0000-000000000001";
const UUID2 = "00000000-0000-0000-0000-000000000002";
const NOW = new Date();

describe("auth schemas", () => {
  it("EntityIdSchema accepts a valid UUID", () => {
    expect(EntityIdSchema.parse(UUID)).toBe(UUID);
  });

  it("EntityIdSchema rejects a non-UUID string", () => {
    expect(() => EntityIdSchema.parse("not-a-uuid")).toThrow();
  });

  it("AuthIdentitySchema parses valid input", () => {
    const result = AuthIdentitySchema.parse({ userId: UUID, email: "a@b.com" });
    expect(result.userId).toBe(UUID);
    expect(result.email).toBe("a@b.com");
  });

  it("AuthIdentitySchema allows missing email", () => {
    const result = AuthIdentitySchema.parse({ userId: UUID });
    expect(result.email).toBeUndefined();
  });

  it("SessionSchema parses valid input", () => {
    const expires = new Date(NOW.getTime() + 1000);
    const result = SessionSchema.parse({ id: UUID, userId: UUID2, createdAt: NOW, expiresAt: expires });
    expect(result.id).toBe(UUID);
  });
});

describe("profiles schemas", () => {
  it("VisibilitySchema accepts all four tiers", () => {
    const tiers = ["public", "followers", "mutuals", "private"] as const;
    for (const tier of tiers) {
      expect(VisibilitySchema.parse(tier)).toBe(tier);
    }
  });

  it("VisibilitySchema rejects unknown tier", () => {
    expect(() => VisibilitySchema.parse("admin")).toThrow();
  });

  it("ProfileSchema parses valid profile", () => {
    const result = ProfileSchema.parse({
      id: UUID,
      handle: "maya",
      displayName: "Maya",
      defaultVisibility: {
        identity: "public",
        follower_list: "public",
        review: "public",
        score: "public",
        finished_shelf: "public",
        custom_shelf: "public",
        want_to_read_shelf: "followers",
        reading_shelf: "followers",
        dropped_shelf: "followers",
        reading_status: "followers",
        activity_stream: "followers",
      },
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(result.handle).toBe("maya");
    expect(result.defaultVisibility.identity).toBe("public");
    expect(result.defaultVisibility.want_to_read_shelf).toBe("followers");
  });

  it("CreateProfileInputSchema does not include defaultVisibility", () => {
    const result = CreateProfileInputSchema.parse({ handle: "maya", displayName: "Maya" });
    expect(result).not.toHaveProperty("defaultVisibility");
  });

  it("FollowSchema parses valid follow", () => {
    const result = FollowSchema.parse({ id: UUID, followerId: UUID, followeeId: UUID2, createdAt: NOW });
    expect(result.followeeId).toBe(UUID2);
  });

  it("BlockSchema parses valid block", () => {
    const result = BlockSchema.parse({ id: UUID, blockerId: UUID, blockedId: UUID2, createdAt: NOW });
    expect(result.blockedId).toBe(UUID2);
  });
});

describe("shelves schemas", () => {
  it("ReadingStatusSchema accepts all statuses", () => {
    const statuses = ["want_to_read", "reading", "finished", "dropped"] as const;
    for (const s of statuses) {
      expect(ReadingStatusSchema.parse(s)).toBe(s);
    }
  });

  it("BookSchema parses valid book", () => {
    const result = BookSchema.parse({
      id: UUID,
      canonicalTitle: "Dune",
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(result.canonicalTitle).toBe("Dune");
  });

  it("EditionSchema validates isbn13 length", () => {
    expect(() => EditionSchema.parse({
      id: UUID,
      bookId: UUID2,
      isbn13: "123",
      title: "Dune",
      source: "manual",
    })).toThrow();
  });

  it("EditionSchema accepts valid isbn13", () => {
    const result = EditionSchema.parse({
      id: UUID,
      bookId: UUID2,
      isbn13: "9780000000002",
      title: "Dune",
      source: "open_library",
    });
    expect(result.isbn13).toBe("9780000000002");
  });

  it("ShelfSchema applies defaults correctly", () => {
    const result = CreateShelfInputSchema.parse({ name: "TBR" });
    expect(result.visibility).toBe("public");
  });

  it("AddShelfItemInputSchema parses valid input", () => {
    const result = AddShelfItemInputSchema.parse({
      shelfId: UUID,
      bookId: UUID2,
      status: "want_to_read",
    });
    expect(result.status).toBe("want_to_read");
  });
});

describe("ranking schemas", () => {
  it("RankingSchema validates score bounds", () => {
    expect(() => RankingSchema.parse({
      id: UUID,
      ownerId: UUID2,
      bookId: UUID,
      rank: 1,
      score: 11,
      createdAt: NOW,
      updatedAt: NOW,
    })).toThrow();
  });

  it("RankingSchema accepts score at boundaries", () => {
    const r0 = RankingSchema.parse({ id: UUID, ownerId: UUID2, bookId: UUID, rank: 1, score: 0, createdAt: NOW, updatedAt: NOW });
    const r10 = RankingSchema.parse({ id: UUID, ownerId: UUID2, bookId: UUID, rank: 1, score: 10, createdAt: NOW, updatedAt: NOW });
    expect(r0.score).toBe(0);
    expect(r10.score).toBe(10);
  });

  it("StartBucketInputSchema accepts all valid bucket values 1-5", () => {
    for (const bucket of [1, 2, 3, 4, 5]) {
      const result = StartBucketInputSchema.parse({ bookId: UUID, bucket });
      expect(result.bucket).toBe(bucket);
    }
  });

  it("StartBucketInputSchema rejects bucket 0", () => {
    expect(() => StartBucketInputSchema.parse({ bookId: UUID, bucket: 0 })).toThrow();
  });

  it("StartBucketInputSchema rejects bucket 6", () => {
    expect(() => StartBucketInputSchema.parse({ bookId: UUID, bucket: 6 })).toThrow();
  });

  it("StartBucketInputSchema rejects non-integer bucket", () => {
    expect(() => StartBucketInputSchema.parse({ bookId: UUID, bucket: 3.5 })).toThrow();
  });

  it("StartBucketInputSchema property: only integers in [1,5] parse successfully", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 5 }), (bucket) => {
        const result = StartBucketInputSchema.parse({ bookId: UUID, bucket });
        return result.bucket === bucket;
      })
    );
  });

  it("StartBucketInputSchema property: integers outside [1,5] always fail", () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.integer({ min: -100, max: 0 }), fc.integer({ min: 6, max: 100 })),
        (bucket) => {
          expect(() => StartBucketInputSchema.parse({ bookId: UUID, bucket })).toThrow();
        }
      )
    );
  });

  it("CreateReviewInputSchema applies public visibility default", () => {
    const result = CreateReviewInputSchema.parse({ bookId: UUID, body: "Great book" });
    expect(result.visibility).toBe("public");
  });

  it("ReviewSchema parses valid review", () => {
    const result = ReviewSchema.parse({
      id: UUID,
      authorId: UUID2,
      bookId: UUID,
      body: "Excellent read",
      visibility: "public",
      version: 1,
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(result.body).toBe("Excellent read");
  });
});

describe("feed schemas", () => {
  it("ActivityVerbSchema accepts all verbs", () => {
    const verbs = ["book_added", "book_started", "book_finished", "book_dropped", "book_ranked", "book_reviewed", "shelf_updated"] as const;
    for (const v of verbs) {
      expect(ActivityVerbSchema.parse(v)).toBe(v);
    }
  });

  it("FeedCursorSchema applies default limit of 20", () => {
    const result = FeedCursorSchema.parse({});
    expect(result.limit).toBe(20);
  });

  it("FeedCursorSchema rejects limit above 50", () => {
    expect(() => FeedCursorSchema.parse({ limit: 51 })).toThrow();
  });
});

describe("recs schemas", () => {
  it("RecommendationSchema validates score is between 0 and 10", () => {
    expect(() => RecommendationSchema.parse({
      book: { id: UUID, canonicalTitle: "Dune", createdAt: NOW, updatedAt: NOW },
      score: -1,
      reason: "You liked Dune",
    })).toThrow();
  });

  it("RecsQuerySchema applies default limit", () => {
    const result = RecsQuerySchema.parse({});
    expect(result.limit).toBe(20);
  });
});

describe("lists schemas", () => {
  it("ListSchema parses valid list", () => {
    const result = ListSchema.parse({
      id: UUID,
      ownerId: UUID2,
      title: "Best Sci-Fi",
      visibility: "public",
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(result.title).toBe("Best Sci-Fi");
  });

  it("CreateListInputSchema applies public visibility default", () => {
    const result = CreateListInputSchema.parse({ title: "My List" });
    expect(result.visibility).toBe("public");
  });

  it("AddListItemInputSchema validates position is positive", () => {
    expect(() => AddListItemInputSchema.parse({ listId: UUID, bookId: UUID2, position: 0 })).toThrow();
  });
});

describe("notifications schemas", () => {
  it("NotificationPlatformSchema accepts apns and fcm", () => {
    expect(NotificationPlatformSchema.parse("apns")).toBe("apns");
    expect(NotificationPlatformSchema.parse("fcm")).toBe("fcm");
  });

  it("NotificationPlatformSchema rejects unknown platform", () => {
    expect(() => NotificationPlatformSchema.parse("web")).toThrow();
  });

  it("RegisterTokenInputSchema parses valid input", () => {
    const result = RegisterTokenInputSchema.parse({ platform: "apns", token: "device-token-123" });
    expect(result.platform).toBe("apns");
  });

  it("NotificationTokenSchema parses valid token", () => {
    const result = NotificationTokenSchema.parse({
      profileId: UUID,
      platform: "fcm",
      token: "abc123",
      lastSeen: NOW,
    });
    expect(result.token).toBe("abc123");
  });

  it("NotificationSettingSchema parses valid setting", () => {
    const result = NotificationSettingSchema.parse({
      profileId: UUID,
      key: "push_new_follower",
      value: true,
    });
    expect(result.key).toBe("push_new_follower");
    expect(result.value).toBe(true);
  });
});
