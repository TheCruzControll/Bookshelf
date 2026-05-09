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
    defaultVisibility: jsonb("default_visibility")
      .notNull()
      .$type<Record<string, string>>(),
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
      .defaultNow()
  },
  (table) => ({
    actorTimeIdx: index("activity_events_actor_time_idx").on(
      table.actorId,
      table.occurredAt
    )
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
