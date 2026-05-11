/**
 * repositories.ts — SQL adapters implementing every repository port from @hone/domain.
 *
 * Visibility filtering
 * --------------------
 * Every read that returns user-owned content MUST pass the results through
 * `applyVisibilityFilter` from `@hone/domain` before returning them to the caller:
 *
 *   import { applyVisibilityFilter } from "@hone/domain";
 *
 *   const items = await db.select()...;
 *   return applyVisibilityFilter(viewerCtx, items);
 *
 * `viewerCtx` is a `ViewerCtx` object carrying the viewer's id and their
 * relationship to the content owner ("self" | "mutual" | "follower" | "none").
 * Pass `{ viewerId: null, relationship: "none" }` for anonymous / unauthenticated
 * callers.
 *
 * Block enforcement
 * -----------------
 * After applying the visibility filter, pipe the surviving items through the
 * `BlockFilter` port to strip any content from users the viewer has blocked or
 * who have blocked the viewer:
 *
 *   const visible = applyVisibilityFilter(viewerCtx, items);
 *   return blockFilter.removeBlocked(viewerCtx.viewerId, visible);
 *
 * This two-step composition (visibility → block) must be applied on every
 * surface that returns content attributed to another user: shelves, reviews,
 * activity feed, rankings, lists, and search results.
 */
import { and, asc, desc, eq, gt, ilike, inArray, lt, or, sql } from "drizzle-orm";
import type {
  ActivityRepository,
  AppRepositories,
  AuthIdentityRepository,
  BlockRepository,
  BookRepository,
  ContactsHash,
  ContactsRepository,
  EntityId,
  FeedItem,
  FollowRepository,
  HandleHistoryRepository,
  ImportRepository,
  ListRepository,
  NotificationRepository,
  ProfileRepository,
  RankingRepository,
  Recommendation,
  RecommendationRepository,
  ReviewRepository,
  SessionRepository,
  ShelfRepository
} from "@hone/domain";
import { POSTURE_C_DEFAULTS, SYSTEM_SHELVES } from "@hone/domain";
import type { HoneDb } from "./client";
import {
  activityEvents,
  authIdentities,
  blocks,
  books,
  contactsIndex,
  editions,
  follows,
  handleHistory,
  imports,
  notificationSettings,
  notificationTokens,
  profiles,
  rankings,
  recommendationScores,
  reviews,
  sessions,
  shelfItems,
  shelves
} from "./schema";
import {
  toActivityEvent,
  toBlock,
  toBook,
  toEdition,
  toFollow,
  toHandleHistory,
  toImport,
  toList,
  toListItem,
  toNotificationSetting,
  toNotificationToken,
  toOAuthIdentity,
  toProfile,
  toRanking,
  toReview,
  toSession,
  toShelf,
  toShelfItem
} from "./mappers";

export class DrizzleProfileRepository implements ProfileRepository {
  constructor(private readonly db: HoneDb) {}

  async findById(id: EntityId) {
    const row = await this.db.query.profiles.findFirst({
      where: eq(profiles.id, id)
    });
    return row ? toProfile(row) : null;
  }

  async findByHandle(handle: string) {
    const row = await this.db.query.profiles.findFirst({
      where: eq(profiles.handle, handle)
    });
    return row ? toProfile(row) : null;
  }

  async create(input: Parameters<ProfileRepository["create"]>[0]) {
    const [row] = await this.db.insert(profiles).values(input).returning();
    if (!row) {
      throw new Error("Failed to create profile");
    }
    return toProfile(row);
  }

  async isHandleTaken(handle: string) {
    const row = await this.db.query.profiles.findFirst({
      where: ilike(profiles.handle, handle),
    });
    return row !== undefined;
  }

  async setHandle(input: { userId: EntityId; handle: string }) {
    const [row] = await this.db
      .update(profiles)
      .set({ handle: input.handle, updatedAt: new Date() })
      .where(eq(profiles.id, input.userId))
      .returning();
    if (!row) {
      throw new Error("Profile not found");
    }
    return toProfile(row);
  }
}

export class DrizzleBookRepository implements BookRepository {
  constructor(private readonly db: HoneDb) {}

  async findBookById(id: EntityId) {
    const row = await this.db.query.books.findFirst({
      where: eq(books.id, id)
    });
    return row ? toBook(row) : null;
  }

  async findEditionByIsbn(isbn: string) {
    const row = await this.db.query.editions.findFirst({
      where: or(eq(editions.isbn10, isbn), eq(editions.isbn13, isbn))
    });
    return row ? toEdition(row) : null;
  }

  async search(query: string, limit: number) {
    const rows = await this.db
      .select()
      .from(books)
      .where(ilike(books.canonicalTitle, `%${query}%`))
      .limit(limit);

    return rows.map(toBook);
  }
}

export class DrizzleShelfRepository implements ShelfRepository {
  constructor(private readonly db: HoneDb) {}

  async listShelves(ownerId: EntityId, viewerId?: EntityId) {
    const isOwner = viewerId === ownerId;
    const rows = await this.db
      .select()
      .from(shelves)
      .where(
        isOwner
          ? eq(shelves.ownerId, ownerId)
          : and(eq(shelves.ownerId, ownerId), eq(shelves.visibility, "public"))
      );

    return rows.map(toShelf);
  }

  async findById(id: EntityId) {
    const row = await this.db.query.shelves.findFirst({
      where: eq(shelves.id, id),
    });
    return row ? toShelf(row) : null;
  }

  async create(input: Parameters<ShelfRepository["create"]>[0]) {
    const [row] = await this.db
      .insert(shelves)
      .values({
        ownerId: input.ownerId,
        name: input.name,
        slug: input.slug,
        visibility: input.visibility,
        isSystem: false,
        kind: "custom" as const,
        authorType: "user" as const,
      })
      .returning();
    if (!row) {
      throw new Error("Failed to create shelf");
    }
    return toShelf(row);
  }

  async update(input: Parameters<ShelfRepository["update"]>[0]) {
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) updateData.name = input.name;
    if (input.visibility !== undefined) updateData.visibility = input.visibility;
    if (input.description !== undefined) updateData.description = input.description;

    const [row] = await this.db
      .update(shelves)
      .set({ ...updateData, version: input.version + 1 })
      .where(
        and(
          eq(shelves.id, input.id),
          eq(shelves.ownerId, input.ownerId),
          eq(shelves.version, input.version)
        )
      )
      .returning();
    if (!row) {
      throw new Error("Stale shelf version or shelf not found");
    }
    return toShelf(row);
  }

  async delete(input: Parameters<ShelfRepository["delete"]>[0]) {
    await this.db
      .delete(shelves)
      .where(and(eq(shelves.id, input.id), eq(shelves.ownerId, input.ownerId)));
  }

  async addBook(input: Parameters<ShelfRepository["addBook"]>[0]) {
    const [row] = await this.db
      .insert(shelfItems)
      .values({
        shelfId: input.shelfId,
        bookId: input.bookId,
        editionId: input.editionId,
        status: "want_to_read"
      })
      .returning();

    if (!row) {
      throw new Error("Failed to add book to shelf");
    }
    return toShelfItem(row);
  }

  async rankShelfItem(input: Parameters<ShelfRepository["rankShelfItem"]>[0]) {
    const [row] = await this.db
      .update(shelfItems)
      .set({ rank: input.rank, updatedAt: new Date() })
      .where(eq(shelfItems.id, input.shelfItemId))
      .returning();

    if (!row) {
      throw new Error("Failed to rank shelf item");
    }
    return toShelfItem(row);
  }

  async createSystemShelves(ownerId: EntityId) {
    const existing = await this.db
      .select()
      .from(shelves)
      .where(and(eq(shelves.ownerId, ownerId), eq(shelves.isSystem, true)));

    const existingSlugs = new Set(existing.map((r) => r.slug));
    const toCreate = SYSTEM_SHELVES.filter((def) => !existingSlugs.has(def.slug));

    if (toCreate.length > 0) {
      await this.db.insert(shelves).values(
        toCreate.map((def) => ({
          ownerId,
          name: def.name,
          slug: def.slug,
          visibility: def.visibility,
          isSystem: true,
          kind: "system" as const,
          authorType: "user" as const,
        }))
      );
    }

    const all = await this.db
      .select()
      .from(shelves)
      .where(and(eq(shelves.ownerId, ownerId), eq(shelves.isSystem, true)));

    return all.map(toShelf);
  }
}

export class DrizzleReviewRepository implements ReviewRepository {
  constructor(private readonly db: HoneDb) {}

  async findById(id: EntityId) {
    const row = await this.db.query.reviews.findFirst({
      where: eq(reviews.id, id),
    });
    return row ? toReview(row) : null;
  }

  async create(input: Parameters<ReviewRepository["create"]>[0]) {
    const [row] = await this.db.insert(reviews).values(input).returning();
    if (!row) {
      throw new Error("Failed to create review");
    }
    return toReview(row);
  }

  async update(input: Parameters<ReviewRepository["update"]>[0]) {
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (input.body !== undefined) updateData.body = input.body;
    if (input.visibility !== undefined) updateData.visibility = input.visibility;

    const [row] = await this.db
      .update(reviews)
      .set({ ...updateData, version: input.version + 1 })
      .where(
        and(
          eq(reviews.id, input.id),
          eq(reviews.authorId, input.authorId),
          eq(reviews.version, input.version)
        )
      )
      .returning();
    if (!row) {
      throw new Error("Stale review version or review not found");
    }
    return toReview(row);
  }
}

export class DrizzleActivityRepository implements ActivityRepository {
  constructor(private readonly db: HoneDb) {}

  async append(event: Parameters<ActivityRepository["append"]>[0]) {
    const { scoreAtPublish, ...rest } = event;
    const [row] = await this.db.insert(activityEvents).values({
      ...rest,
      scoreAtPublish: scoreAtPublish != null ? String(scoreAtPublish) : null,
    }).returning();
    if (!row) {
      throw new Error("Failed to append activity event");
    }
    return toActivityEvent(row);
  }

  async getFriendFeed(input: Parameters<ActivityRepository["getFriendFeed"]>[0]) {
    const followRows = await this.db
      .select({ followeeId: follows.followeeId })
      .from(follows)
      .where(eq(follows.followerId, input.viewerId));

    const friendIds = followRows.map((row) => row.followeeId);

    if (friendIds.length === 0) {
      return [];
    }

    const rows = await this.db
      .select()
      .from(activityEvents)
      .where(eq(activityEvents.visibility, "followers"))
      .orderBy(desc(activityEvents.occurredAt))
      .limit(input.limit);

    const friendEvents = rows
      .filter((row) => friendIds.includes(row.actorId))
      .map(toActivityEvent);

    const feedItems: FeedItem[] = friendEvents.map((event) => ({ event, actor: {
      id: event.actorId,
      handle: "unknown",
      displayName: "Unknown reader",
      defaultVisibility: POSTURE_C_DEFAULTS,
      version: 1,
      createdAt: event.occurredAt,
      updatedAt: event.occurredAt
    }}));

    return feedItems;
  }
}

export class DrizzleRecommendationRepository
  implements RecommendationRepository
{
  constructor(private readonly db: HoneDb) {}

  async getForUser(userId: EntityId, limit: number): Promise<Recommendation[]> {
    const rows = await this.db
      .select({
        book: books,
        score: recommendationScores.score,
        reason: recommendationScores.reason
      })
      .from(recommendationScores)
      .innerJoin(books, eq(recommendationScores.bookId, books.id))
      .where(eq(recommendationScores.userId, userId))
      .orderBy(desc(recommendationScores.score))
      .limit(limit);

    return rows.map((row) => ({
      book: toBook(row.book),
      score: row.score,
      reason: row.reason
    }));
  }
}

class DrizzleFollowRepository implements FollowRepository {
  constructor(private readonly db: HoneDb) {}

  async follow(input: { followerId: EntityId; followeeId: EntityId }) {
    const [row] = await this.db
      .insert(follows)
      .values({
        followerId: input.followerId,
        followeeId: input.followeeId,
      })
      .onConflictDoNothing()
      .returning();
    if (!row) {
      const existing = await this.findFollow(input);
      if (!existing) throw new Error("Failed to create follow");
      return existing;
    }
    return toFollow(row);
  }

  async unfollow(input: { followerId: EntityId; followeeId: EntityId }) {
    await this.db
      .delete(follows)
      .where(
        and(
          eq(follows.followerId, input.followerId),
          eq(follows.followeeId, input.followeeId)
        )
      );
  }

  async findFollow(input: { followerId: EntityId; followeeId: EntityId }) {
    const row = await this.db.query.follows.findFirst({
      where: and(
        eq(follows.followerId, input.followerId),
        eq(follows.followeeId, input.followeeId)
      ),
    });
    return row ? toFollow(row) : null;
  }

  async listFollowers(userId: EntityId, _viewerId?: EntityId) {
    const rows = await this.db
      .select()
      .from(follows)
      .where(eq(follows.followeeId, userId))
      .orderBy(desc(follows.createdAt));
    return rows.map(toFollow);
  }

  async listFollowing(userId: EntityId, _viewerId?: EntityId) {
    const rows = await this.db
      .select()
      .from(follows)
      .where(eq(follows.followerId, userId))
      .orderBy(desc(follows.createdAt));
    return rows.map(toFollow);
  }

  async isMutual(input: { userA: EntityId; userB: EntityId }) {
    const [aFollowsB, bFollowsA] = await Promise.all([
      this.db.query.follows.findFirst({
        where: and(
          eq(follows.followerId, input.userA),
          eq(follows.followeeId, input.userB)
        ),
      }),
      this.db.query.follows.findFirst({
        where: and(
          eq(follows.followerId, input.userB),
          eq(follows.followeeId, input.userA)
        ),
      }),
    ]);
    return aFollowsB !== undefined && bFollowsA !== undefined;
  }
}

class DrizzleBlockRepository implements BlockRepository {
  constructor(private readonly db: HoneDb) {}

  async block(input: { blockerId: EntityId; blockedId: EntityId }) {
    const [row] = await this.db
      .insert(blocks)
      .values({
        blockerId: input.blockerId,
        blockedId: input.blockedId,
      })
      .onConflictDoNothing()
      .returning();
    if (!row) {
      const existing = await this.findBlock(input);
      if (!existing) throw new Error("Failed to create block");
      return existing;
    }
    return toBlock(row);
  }

  async unblock(input: { blockerId: EntityId; blockedId: EntityId }) {
    await this.db
      .delete(blocks)
      .where(
        and(
          eq(blocks.blockerId, input.blockerId),
          eq(blocks.blockedId, input.blockedId)
        )
      );
  }

  async findBlock(input: { blockerId: EntityId; blockedId: EntityId }) {
    const row = await this.db.query.blocks.findFirst({
      where: and(
        eq(blocks.blockerId, input.blockerId),
        eq(blocks.blockedId, input.blockedId)
      ),
    });
    return row ? toBlock(row) : null;
  }

  async listBlockedByUser(blockerId: EntityId) {
    const rows = await this.db
      .select()
      .from(blocks)
      .where(eq(blocks.blockerId, blockerId))
      .orderBy(desc(blocks.createdAt));
    return rows.map(toBlock);
  }

  async listBlockingUser(blockedId: EntityId) {
    const rows = await this.db
      .select()
      .from(blocks)
      .where(eq(blocks.blockedId, blockedId))
      .orderBy(desc(blocks.createdAt));
    return rows.map(toBlock);
  }

  async isBlocked(input: { viewerId: EntityId; targetId: EntityId }) {
    const row = await this.db.query.blocks.findFirst({
      where: or(
        and(eq(blocks.blockerId, input.viewerId), eq(blocks.blockedId, input.targetId)),
        and(eq(blocks.blockerId, input.targetId), eq(blocks.blockedId, input.viewerId))
      ),
    });
    return row !== undefined;
  }
}

class DrizzleRankingRepository implements RankingRepository {
  constructor(private readonly db: HoneDb) {}

  async upsert(input: {
    ownerId: EntityId;
    bookId: EntityId;
    rank: number;
    score: number;
  }) {
    const [row] = await this.db
      .insert(rankings)
      .values({
        profileId: input.ownerId,
        bookId: input.bookId,
        position: input.rank,
        score: String(input.score),
        bucket: 0,
      })
      .onConflictDoUpdate({
        target: [rankings.profileId, rankings.bookId],
        set: {
          position: input.rank,
          score: String(input.score),
          version: sql`${rankings.version} + 1`,
          updatedAt: new Date(),
        },
      })
      .returning();
    if (!row) throw new Error("Failed to upsert ranking");
    return toRanking(row);
  }

  async findById(id: EntityId) {
    const row = await this.db.query.rankings.findFirst({
      where: eq(rankings.id, id),
    });
    return row ? toRanking(row) : null;
  }

  async findByOwnerAndBook(input: { ownerId: EntityId; bookId: EntityId }) {
    const row = await this.db.query.rankings.findFirst({
      where: and(
        eq(rankings.profileId, input.ownerId),
        eq(rankings.bookId, input.bookId)
      ),
    });
    return row ? toRanking(row) : null;
  }

  async listByOwner(ownerId: EntityId, _viewerId?: EntityId) {
    const rows = await this.db
      .select()
      .from(rankings)
      .where(eq(rankings.profileId, ownerId))
      .orderBy(asc(rankings.position));
    return rows.map(toRanking);
  }

  async delete(input: { ownerId: EntityId; bookId: EntityId }) {
    await this.db
      .delete(rankings)
      .where(
        and(
          eq(rankings.profileId, input.ownerId),
          eq(rankings.bookId, input.bookId)
        )
      );
  }

  async startBucket(input: {
    ownerId: EntityId;
    bookId: EntityId;
    bucket: number;
  }) {
    const [row] = await this.db
      .update(rankings)
      .set({ bucket: input.bucket, updatedAt: new Date() })
      .where(
        and(
          eq(rankings.profileId, input.ownerId),
          eq(rankings.bookId, input.bookId)
        )
      )
      .returning();
    if (!row) throw new Error("Ranking not found");
    return toRanking(row);
  }
}

class DrizzleNotificationRepository implements NotificationRepository {
  constructor(private readonly db: HoneDb) {}

  async registerToken(input: Parameters<NotificationRepository["registerToken"]>[0]) {
    const [row] = await this.db
      .insert(notificationTokens)
      .values({
        profileId: input.profileId,
        platform: input.platform,
        token: input.token,
        lastSeen: new Date(),
      })
      .onConflictDoUpdate({
        target: [notificationTokens.profileId, notificationTokens.platform, notificationTokens.token],
        set: { lastSeen: new Date() },
      })
      .returning();
    if (!row) throw new Error("Failed to register token");
    return toNotificationToken(row);
  }

  async removeToken(input: { profileId: EntityId; token: string }) {
    await this.db
      .delete(notificationTokens)
      .where(
        and(
          eq(notificationTokens.profileId, input.profileId),
          eq(notificationTokens.token, input.token)
        )
      );
  }

  async listTokensForProfile(profileId: EntityId) {
    const rows = await this.db
      .select()
      .from(notificationTokens)
      .where(eq(notificationTokens.profileId, profileId));
    return rows.map(toNotificationToken);
  }

  async getSetting(input: { profileId: EntityId; key: string }) {
    const row = await this.db.query.notificationSettings.findFirst({
      where: and(
        eq(notificationSettings.profileId, input.profileId),
        eq(notificationSettings.key, input.key)
      ),
    });
    return row ? toNotificationSetting(row) : null;
  }

  async setSetting(input: { profileId: EntityId; key: string; value: unknown }) {
    const [row] = await this.db
      .insert(notificationSettings)
      .values({
        profileId: input.profileId,
        key: input.key,
        value: input.value,
      })
      .onConflictDoUpdate({
        target: [notificationSettings.profileId, notificationSettings.key],
        set: { value: input.value },
      })
      .returning();
    if (!row) throw new Error("Failed to set notification setting");
    return toNotificationSetting(row);
  }

  async listSettings(profileId: EntityId) {
    const rows = await this.db
      .select()
      .from(notificationSettings)
      .where(eq(notificationSettings.profileId, profileId));
    return rows.map(toNotificationSetting);
  }
}

class DrizzleImportRepository implements ImportRepository {
  constructor(private readonly db: HoneDb) {}

  async create(input: Parameters<ImportRepository["create"]>[0]) {
    const [row] = await this.db
      .insert(imports)
      .values({
        id: input.id,
        ownerId: input.ownerId,
        source: input.source,
        idempotencyHash: input.idempotencyHash ?? null,
        status: "pending",
      })
      .returning();
    if (!row) throw new Error("Failed to create import");
    return toImport(row);
  }

  async findById(id: EntityId) {
    const row = await this.db.query.imports.findFirst({
      where: eq(imports.id, id),
    });
    return row ? toImport(row) : null;
  }

  async findByOwnerAndHash(input: { ownerId: EntityId; hash: string }) {
    const row = await this.db.query.imports.findFirst({
      where: and(
        eq(imports.ownerId, input.ownerId),
        eq(imports.idempotencyHash, input.hash)
      ),
    });
    return row ? toImport(row) : null;
  }

  async listByOwner(ownerId: EntityId) {
    const rows = await this.db
      .select()
      .from(imports)
      .where(eq(imports.ownerId, ownerId))
      .orderBy(desc(imports.createdAt));
    return rows.map(toImport);
  }

  async updateStatus(input: Parameters<ImportRepository["updateStatus"]>[0]) {
    const [row] = await this.db
      .update(imports)
      .set({
        status: input.status,
        completedAt: input.completedAt ?? null,
      })
      .where(eq(imports.id, input.id))
      .returning();
    if (!row) throw new Error("Import not found");
    return toImport(row);
  }
}

class DrizzleContactsRepository implements ContactsRepository {
  constructor(private readonly db: HoneDb) {}

  async upsertHashes(input: {
    userId: EntityId;
    hashes: Array<{ hash: string; saltVersion: number; expiresAt: Date }>;
  }) {
    if (input.hashes.length === 0) return;
    await this.db
      .insert(contactsIndex)
      .values(
        input.hashes.map((h) => ({
          profileId: input.userId,
          contactHash: h.hash,
          saltVersion: h.saltVersion,
          expiresAt: h.expiresAt,
        }))
      )
      .onConflictDoUpdate({
        target: [contactsIndex.profileId, contactsIndex.contactHash],
        set: {
          saltVersion: sql`excluded.salt_version`,
          expiresAt: sql`excluded.expires_at`,
        },
      });
  }

  async findMatches(input: { hashes: string[]; excludeUserId: EntityId }) {
    if (input.hashes.length === 0) return [];
    const now = new Date();
    const rows = await this.db
      .select({ profileId: contactsIndex.profileId })
      .from(contactsIndex)
      .where(
        and(
          inArray(contactsIndex.contactHash, input.hashes),
          gt(contactsIndex.expiresAt, now)
        )
      );
    return rows
      .map((r) => r.profileId)
      .filter((id) => id !== input.excludeUserId);
  }

  async deleteForUser(userId: EntityId) {
    await this.db
      .delete(contactsIndex)
      .where(eq(contactsIndex.profileId, userId));
  }

  async deleteExpired() {
    const now = new Date();
    await this.db
      .delete(contactsIndex)
      .where(lt(contactsIndex.expiresAt, now));
  }

  async listByUser(userId: EntityId): Promise<ContactsHash[]> {
    const rows = await this.db
      .select()
      .from(contactsIndex)
      .where(eq(contactsIndex.profileId, userId));
    return rows.map((row) => ({
      id: `${row.profileId}:${row.contactHash}`,
      userId: row.profileId,
      hash: row.contactHash,
      saltVersion: row.saltVersion,
      createdAt: new Date(),
      expiresAt: row.expiresAt,
    }));
  }
}

class DrizzleListRepository implements ListRepository {
  constructor(private readonly db: HoneDb) {}

  async create(input: Parameters<ListRepository["create"]>[0]) {
    const slug = input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const [row] = await this.db
      .insert(shelves)
      .values({
        id: input.id,
        ownerId: input.ownerId,
        name: input.title,
        slug,
        visibility: input.visibility,
        isSystem: false,
        kind: "list" as const,
        authorType: "user" as const,
        description: input.description ?? null,
      })
      .returning();
    if (!row) throw new Error("Failed to create list");
    return toList(row);
  }

  async findById(id: EntityId) {
    const row = await this.db.query.shelves.findFirst({
      where: and(eq(shelves.id, id), eq(shelves.kind, "list")),
    });
    return row ? toList(row) : null;
  }

  async listByOwner(ownerId: EntityId) {
    const rows = await this.db
      .select()
      .from(shelves)
      .where(and(eq(shelves.ownerId, ownerId), eq(shelves.kind, "list")))
      .orderBy(desc(shelves.createdAt));
    return rows.map(toList);
  }

  async update(input: Parameters<ListRepository["update"]>[0]) {
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (input.title !== undefined) updateData.name = input.title;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.visibility !== undefined) updateData.visibility = input.visibility;

    const [row] = await this.db
      .update(shelves)
      .set(updateData)
      .where(
        and(
          eq(shelves.id, input.id),
          eq(shelves.ownerId, input.ownerId),
          eq(shelves.kind, "list")
        )
      )
      .returning();
    if (!row) throw new Error("List not found");
    return toList(row);
  }

  async delete(input: { id: EntityId; ownerId: EntityId }) {
    await this.db
      .delete(shelves)
      .where(
        and(
          eq(shelves.id, input.id),
          eq(shelves.ownerId, input.ownerId),
          eq(shelves.kind, "list")
        )
      );
  }

  async addItem(input: { listId: EntityId; bookId: EntityId; position: number }) {
    const [row] = await this.db
      .insert(shelfItems)
      .values({
        shelfId: input.listId,
        bookId: input.bookId,
        position: input.position,
        status: "want_to_read",
      })
      .returning();
    if (!row) throw new Error("Failed to add item to list");
    return toListItem(row);
  }

  async removeItem(input: { listId: EntityId; bookId: EntityId }) {
    await this.db
      .delete(shelfItems)
      .where(
        and(
          eq(shelfItems.shelfId, input.listId),
          eq(shelfItems.bookId, input.bookId)
        )
      );
  }

  async listItems(listId: EntityId) {
    const rows = await this.db
      .select()
      .from(shelfItems)
      .where(eq(shelfItems.shelfId, listId))
      .orderBy(asc(shelfItems.position));
    return rows.map(toListItem);
  }

  async reorderItems(input: { listId: EntityId; orderedBookIds: EntityId[] }) {
    await Promise.all(
      input.orderedBookIds.map((bookId, index) =>
        this.db
          .update(shelfItems)
          .set({ position: index, updatedAt: new Date() })
          .where(
            and(
              eq(shelfItems.shelfId, input.listId),
              eq(shelfItems.bookId, bookId)
            )
          )
      )
    );
  }
}

class DrizzleAuthIdentityRepository implements AuthIdentityRepository {
  constructor(private readonly db: HoneDb) {}

  async create(input: Parameters<AuthIdentityRepository["create"]>[0]) {
    const [row] = await this.db
      .insert(authIdentities)
      .values({
        provider: input.provider,
        providerUserId: input.providerUserId,
        profileId: input.profileId
      })
      .onConflictDoNothing()
      .returning();
    if (!row) {
      const existing = await this.findByProvider({ provider: input.provider, providerUserId: input.providerUserId });
      if (!existing) throw new Error("Failed to create auth identity");
      return existing;
    }
    return toOAuthIdentity(row);
  }

  async findByProvider(input: { provider: string; providerUserId: string }) {
    const row = await this.db.query.authIdentities.findFirst({
      where: and(
        eq(authIdentities.provider, input.provider),
        eq(authIdentities.providerUserId, input.providerUserId)
      )
    });
    return row ? toOAuthIdentity(row) : null;
  }

  async listByProfile(profileId: EntityId) {
    const rows = await this.db
      .select()
      .from(authIdentities)
      .where(eq(authIdentities.profileId, profileId));
    return rows.map(toOAuthIdentity);
  }
}

class DrizzleSessionRepository implements SessionRepository {
  constructor(private readonly db: HoneDb) {}

  async create(input: Parameters<SessionRepository["create"]>[0]) {
    const [row] = await this.db
      .insert(sessions)
      .values({
        tokenHash: input.tokenHash,
        profileId: input.profileId,
        expiresAt: input.expiresAt
      })
      .returning();
    if (!row) throw new Error("Failed to create session");
    return toSession(row);
  }

  async findByTokenHash(tokenHash: string) {
    const row = await this.db.query.sessions.findFirst({
      where: eq(sessions.tokenHash, tokenHash)
    });
    return row ? toSession(row) : null;
  }

  async revokeByTokenHash(tokenHash: string) {
    await this.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.tokenHash, tokenHash));
  }

  async revokeAllForProfile(profileId: EntityId) {
    await this.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.profileId, profileId));
  }
}

class DrizzleHandleHistoryRepository implements HandleHistoryRepository {
  constructor(private readonly db: HoneDb) {}

  async record(input: Parameters<HandleHistoryRepository["record"]>[0]) {
    const [row] = await this.db
      .insert(handleHistory)
      .values({
        profileId: input.profileId,
        oldHandle: input.oldHandle,
        retiredAt: input.retiredAt,
        expiresAt: input.expiresAt
      })
      .returning();
    if (!row) throw new Error("Failed to record handle history");
    return toHandleHistory(row);
  }

  async findCurrentByOldHandle(oldHandle: string) {
    const now = new Date();
    const row = await this.db.query.handleHistory.findFirst({
      where: and(
        eq(handleHistory.oldHandle, oldHandle),
        gt(handleHistory.expiresAt, now)
      )
    });
    return row ? toHandleHistory(row) : null;
  }
}

export function createDrizzleRepositories(db: HoneDb): AppRepositories {
  return {
    profiles: new DrizzleProfileRepository(db),
    books: new DrizzleBookRepository(db),
    shelves: new DrizzleShelfRepository(db),
    reviews: new DrizzleReviewRepository(db),
    activity: new DrizzleActivityRepository(db),
    recommendations: new DrizzleRecommendationRepository(db),
    follows: new DrizzleFollowRepository(db),
    blocks: new DrizzleBlockRepository(db),
    rankings: new DrizzleRankingRepository(db),
    notifications: new DrizzleNotificationRepository(db),
    imports: new DrizzleImportRepository(db),
    contacts: new DrizzleContactsRepository(db),
    lists: new DrizzleListRepository(db),
    authIdentities: new DrizzleAuthIdentityRepository(db),
    sessions: new DrizzleSessionRepository(db),
    handleHistory: new DrizzleHandleHistoryRepository(db),
  };
}
