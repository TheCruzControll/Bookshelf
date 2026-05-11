import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";
import type { ContentType, Visibility } from "@hone/domain";

export const shelfKindEnum = pgEnum("shelf_kind", [
  "system",
  "custom",
  "list"
]);

export const shelfAuthorTypeEnum = pgEnum("shelf_author_type", [
  "user",
  "internal_editorial",
  "algorithmic"
]);

export const visibilityEnum = pgEnum("visibility", [
  "public",
  "followers",
  "mutuals",
  "private"
]);

export const readingStatusEnum = pgEnum("reading_status", [
  "want_to_read",
  "reading",
  "finished",
  "dropped"
]);

export const activityVerbEnum = pgEnum("activity_verb", [
  "book_added",
  "book_started",
  "book_finished",
  "book_dropped",
  "book_ranked",
  "book_reviewed",
  "shelf_updated"
]);

export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id").primaryKey(),
    handle: text("handle").notNull(),
    displayName: text("display_name").notNull(),
    bio: text("bio"),
    avatarUrl: text("avatar_url"),
    verified: boolean("verified").notNull().default(false),
    defaultVisibility: jsonb("default_visibility").$type<Record<ContentType, Visibility>>().notNull(),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => ({
    handleIdx: uniqueIndex("profiles_handle_idx").on(table.handle)
  })
);

export const follows = pgTable(
  "follows",
  {
    followerId: uuid("follower_id")
      .notNull()
      .references(() => profiles.id),
    followeeId: uuid("followee_id")
      .notNull()
      .references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => ({
    pairIdx: uniqueIndex("follows_pair_idx").on(
      table.followerId,
      table.followeeId
    ),
    followerIdx: index("follows_follower_idx").on(table.followerId),
    followeeIdx: index("follows_followee_idx").on(table.followeeId)
  })
);

export const blocks = pgTable(
  "blocks",
  {
    blockerId: uuid("blocker_id")
      .notNull()
      .references(() => profiles.id),
    blockedId: uuid("blocked_id")
      .notNull()
      .references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => ({
    pairIdx: uniqueIndex("blocks_pair_idx").on(table.blockerId, table.blockedId),
    blockerIdx: index("blocks_blocker_idx").on(table.blockerId),
    blockedIdx: index("blocks_blocked_idx").on(table.blockedId)
  })
);

export const blocksAgainstHash = pgTable(
  "blocks_against_hash",
  {
    hash: text("hash").notNull().primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull()
  },
  (table) => ({
    expiresAtIdx: index("blocks_against_hash_expires_at_idx").on(table.expiresAt)
  })
);

export const authors = pgTable("authors", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull()
});

export const books = pgTable(
  "books",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    canonicalTitle: text("canonical_title").notNull(),
    subtitle: text("subtitle"),
    description: text("description"),
    coverUrl: text("cover_url"),
    firstPublishedYear: integer("first_published_year"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => ({
    titleIdx: index("books_title_idx").on(table.canonicalTitle)
  })
);

export const bookAuthors = pgTable(
  "book_authors",
  {
    bookId: uuid("book_id")
      .notNull()
      .references(() => books.id),
    authorId: uuid("author_id")
      .notNull()
      .references(() => authors.id)
  },
  (table) => ({
    bookAuthorIdx: uniqueIndex("book_authors_book_author_idx").on(
      table.bookId,
      table.authorId
    )
  })
);

export const editions = pgTable(
  "editions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookId: uuid("book_id")
      .notNull()
      .references(() => books.id),
    isbn10: text("isbn_10"),
    isbn13: text("isbn_13"),
    title: text("title").notNull(),
    publisher: text("publisher"),
    publishedDate: text("published_date"),
    pageCount: integer("page_count"),
    source: text("source").notNull(),
    sourceKey: text("source_key")
  },
  (table) => ({
    isbn10Idx: uniqueIndex("editions_isbn_10_idx").on(table.isbn10),
    isbn13Idx: uniqueIndex("editions_isbn_13_idx").on(table.isbn13),
    sourceIdx: index("editions_source_idx").on(table.source, table.sourceKey)
  })
);

export const shelves = pgTable(
  "shelves",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => profiles.id),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    visibility: visibilityEnum("visibility").notNull().default("public"),
    isSystem: boolean("is_system").notNull().default(false),
    kind: shelfKindEnum("kind").notNull().default("custom"),
    authorType: shelfAuthorTypeEnum("author_type").notNull().default("user"),
    curatorTier: integer("curator_tier"),
    description: text("description"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => ({
    ownerSlugIdx: uniqueIndex("shelves_owner_slug_idx").on(
      table.ownerId,
      table.slug
    )
  })
);

export const shelfItems = pgTable(
  "shelf_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shelfId: uuid("shelf_id")
      .notNull()
      .references(() => shelves.id),
    bookId: uuid("book_id")
      .notNull()
      .references(() => books.id),
    editionId: uuid("edition_id").references(() => editions.id),
    status: readingStatusEnum("status").notNull(),
    rank: integer("rank"),
    notes: text("notes"),
    position: integer("position"),
    addedAt: timestamp("added_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => ({
    shelfBookIdx: uniqueIndex("shelf_items_shelf_book_idx").on(
      table.shelfId,
      table.bookId
    ),
    shelfRankIdx: index("shelf_items_shelf_rank_idx").on(
      table.shelfId,
      table.rank
    )
  })
);

export const reviews = pgTable("reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  authorId: uuid("author_id")
    .notNull()
    .references(() => profiles.id),
  bookId: uuid("book_id")
    .notNull()
    .references(() => books.id),
  editionId: uuid("edition_id").references(() => editions.id),
  body: text("body").notNull(),
  visibility: visibilityEnum("visibility").notNull().default("public"),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
});

export const activityEvents = pgTable(
  "activity_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => profiles.id),
    verb: activityVerbEnum("verb").notNull(),
    bookId: uuid("book_id").references(() => books.id),
    shelfId: uuid("shelf_id").references(() => shelves.id),
    reviewId: uuid("review_id").references(() => reviews.id),
    visibility: visibilityEnum("visibility").notNull().default("followers"),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    scoreAtPublish: numeric("score_at_publish"),
    scoreLockedAtPublish: boolean("score_locked_at_publish"),
    groupKey: text("group_key")
  },
  (table) => ({
    actorTimeIdx: index("activity_events_actor_time_idx").on(
      table.actorId,
      table.occurredAt
    ),
    groupKeyIdx: index("activity_events_group_key_idx").on(table.groupKey)
  })
);

export const imports = pgTable("imports", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => profiles.id),
  source: text("source").notNull(),
  idempotencyHash: text("idempotency_hash"),
  conflictCount: integer("conflict_count").notNull().default(0),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true })
});

export const rankings = pgTable(
  "rankings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id),
    bookId: uuid("book_id")
      .notNull()
      .references(() => books.id),
    position: integer("position").notNull(),
    score: numeric("score", { precision: 5, scale: 2 }).notNull(),
    bucket: smallint("bucket").notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => ({
    profileBookIdx: uniqueIndex("rankings_profile_book_idx").on(
      table.profileId,
      table.bookId
    ),
    profilePositionIdx: index("rankings_profile_position_idx").on(
      table.profileId,
      table.position
    )
  })
);

export const accountDeletions = pgTable("account_deletions", {
  profileId: uuid("profile_id")
    .notNull()
    .primaryKey()
    .references(() => profiles.id),
  requestedAt: timestamp("requested_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  hardDeleteAfter: timestamp("hard_delete_after", { withTimezone: true }).notNull(),
  exportedAt: timestamp("exported_at", { withTimezone: true })
});

export const recommendationScores = pgTable(
  "recommendation_scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id),
    bookId: uuid("book_id")
      .notNull()
      .references(() => books.id),
    score: integer("score").notNull(),
    reason: text("reason").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => ({
    userBookIdx: uniqueIndex("recommendation_scores_user_book_idx").on(
      table.userId,
      table.bookId
    )
  })
);

export const tasteVectors = pgTable(
  "taste_vectors",
  {
    profileId: uuid("profile_id")
      .primaryKey()
      .references(() => profiles.id),
    vector: jsonb("vector").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => ({
    profileIdx: index("taste_vectors_profile_idx").on(table.profileId)
  })
);

export const phoneVerifications = pgTable(
  "phone_verifications",
  {
    phoneE164: text("phone_e164").primaryKey(),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull()
  },
  (table) => ({
    expiresAtIdx: index("phone_verifications_expires_at_idx").on(table.expiresAt)
  })
);

export const phoneNumbers = pgTable(
  "phone_numbers",
  {
    profileId: uuid("profile_id")
      .primaryKey()
      .references(() => profiles.id),
    e164Hash: text("e164_hash").notNull()
  },
  (table) => ({
    e164HashIdx: uniqueIndex("phone_numbers_e164_hash_idx").on(table.e164Hash)
  })
);

export const authIdentities = pgTable(
  "auth_identities",
  {
    provider: text("provider").notNull(),
    providerUserId: text("provider_user_id").notNull(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id)
  },
  (table) => ({
    pkIdx: uniqueIndex("auth_identities_provider_user_idx").on(
      table.provider,
      table.providerUserId
    ),
    profileIdx: index("auth_identities_profile_idx").on(table.profileId)
  })
);

export const sessions = pgTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true })
  },
  (table) => ({
    profileIdx: index("sessions_profile_idx").on(table.profileId),
    expiresAtIdx: index("sessions_expires_at_idx").on(table.expiresAt)
  })
);

export const contactsIndex = pgTable(
  "contacts_index",
  {
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id),
    contactHash: text("contact_hash").notNull(),
    saltVersion: integer("salt_version").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull()
  },
  (table) => ({
    pairIdx: uniqueIndex("contacts_index_profile_hash_idx").on(
      table.profileId,
      table.contactHash
    ),
    profileIdx: index("contacts_index_profile_idx").on(table.profileId),
    expiresAtIdx: index("contacts_index_expires_at_idx").on(table.expiresAt)
  })
);

export const emailIndex = pgTable(
  "email_index",
  {
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id),
    emailHash: text("email_hash").notNull(),
    saltVersion: integer("salt_version").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull()
  },
  (table) => ({
    pairIdx: uniqueIndex("email_index_profile_hash_idx").on(
      table.profileId,
      table.emailHash
    ),
    profileIdx: index("email_index_profile_idx").on(table.profileId),
    expiresAtIdx: index("email_index_expires_at_idx").on(table.expiresAt)
  })
);

export const notificationPlatformEnum = pgEnum("notification_platform", [
  "apns",
  "fcm"
]);

export const notificationTokens = pgTable(
  "notification_tokens",
  {
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id),
    platform: notificationPlatformEnum("platform").notNull(),
    token: text("token").notNull(),
    lastSeen: timestamp("last_seen", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => ({
    pkIdx: uniqueIndex("notification_tokens_profile_platform_token_idx").on(
      table.profileId,
      table.platform,
      table.token
    ),
    profileIdx: index("notification_tokens_profile_idx").on(table.profileId)
  })
);

export const notificationSettings = pgTable(
  "notification_settings",
  {
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id),
    key: text("key").notNull(),
    value: jsonb("value").notNull()
  },
  (table) => ({
    pkIdx: uniqueIndex("notification_settings_profile_key_idx").on(
      table.profileId,
      table.key
    ),
    profileIdx: index("notification_settings_profile_idx").on(table.profileId)
  })
);

export const salts = pgTable(
  "salts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    version: integer("version").notNull(),
    keyMaterial: text("key_material").notNull(),
    activeFrom: timestamp("active_from", { withTimezone: true })
      .notNull()
      .defaultNow(),
    activeTo: timestamp("active_to", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => ({
    versionIdx: uniqueIndex("salts_version_idx").on(table.version),
    activeIdx: index("salts_active_idx").on(table.activeFrom, table.activeTo)
  })
);

export const handleHistory = pgTable(
  "handle_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id),
    oldHandle: text("old_handle").notNull(),
    retiredAt: timestamp("retired_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull()
  },
  (table) => ({
    oldHandleIdx: index("handle_history_old_handle_idx").on(table.oldHandle),
    profileIdx: index("handle_history_profile_idx").on(table.profileId),
    expiresAtIdx: index("handle_history_expires_at_idx").on(table.expiresAt)
  })
);

export const magicLinkTokens = pgTable(
  "magic_link_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    email: text("email").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => ({
    emailIdx: index("magic_link_tokens_email_idx").on(table.email),
    expiresAtIdx: index("magic_link_tokens_expires_at_idx").on(table.expiresAt)
  })
);

export const notificationTriggerEnum = pgEnum("notification_trigger", [
  "new_follower",
  "mutual_follow_back",
  "mutual_rated_high",
  "mutual_finished_want_to_read",
  "security_event",
]);

export const inAppNotifications = pgTable(
  "in_app_notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipientId: uuid("recipient_id")
      .notNull()
      .references(() => profiles.id),
    actorId: uuid("actor_id").references(() => profiles.id),
    trigger: notificationTriggerEnum("trigger").notNull(),
    payload: jsonb("payload").notNull().default({}),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    recipientTimeIdx: index("in_app_notifications_recipient_time_idx").on(
      table.recipientId,
      table.createdAt
    ),
    actorIdx: index("in_app_notifications_actor_idx").on(table.actorId),
  })
);
