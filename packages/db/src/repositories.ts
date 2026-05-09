import { and, desc, eq, ilike, or } from "drizzle-orm";
import type {
  ActivityRepository,
  AppRepositories,
  AuthIdentityRepository,
  BlockRepository,
  BookRepository,
  ContactsRepository,
  EntityId,
  FeedItem,
  FollowRepository,
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
import { SYSTEM_SHELVES } from "@hone/domain";
import type { HoneDb } from "./client";
import {
  activityEvents,
  authIdentities,
  books,
  editions,
  follows,
  imports,
  profiles,
  recommendationScores,
  reviews,
  sessions,
  shelfItems,
  shelves
} from "./schema";
import {
  toActivityEvent,
  toBook,
  toEdition,
  toImport,
  toOAuthIdentity,
  toProfile,
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
    const [row] = await this.db.insert(activityEvents).values(event).returning();
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
      defaultVisibility: "public",
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
  async follow(): Promise<never> { throw new Error("not implemented"); }
  async unfollow(): Promise<void> { throw new Error("not implemented"); }
  async findFollow(): Promise<null> { throw new Error("not implemented"); }
  async listFollowers(): Promise<never[]> { throw new Error("not implemented"); }
  async listFollowing(): Promise<never[]> { throw new Error("not implemented"); }
  async isMutual(): Promise<boolean> { throw new Error("not implemented"); }
}

class DrizzleBlockRepository implements BlockRepository {
  constructor(private readonly db: HoneDb) {}
  async block(): Promise<never> { throw new Error("not implemented"); }
  async unblock(): Promise<void> { throw new Error("not implemented"); }
  async findBlock(): Promise<null> { throw new Error("not implemented"); }
  async listBlockedByUser(): Promise<never[]> { throw new Error("not implemented"); }
  async isBlocked(): Promise<boolean> { throw new Error("not implemented"); }
}

class DrizzleRankingRepository implements RankingRepository {
  constructor(private readonly db: HoneDb) {}
  async upsert(): Promise<never> { throw new Error("not implemented"); }
  async findById(): Promise<null> { throw new Error("not implemented"); }
  async findByOwnerAndBook(): Promise<null> { throw new Error("not implemented"); }
  async listByOwner(): Promise<never[]> { throw new Error("not implemented"); }
  async delete(): Promise<void> { throw new Error("not implemented"); }
  async startBucket(): Promise<never> { throw new Error("not implemented"); }
}

class DrizzleNotificationRepository implements NotificationRepository {
  constructor(private readonly db: HoneDb) {}
  async registerToken(): Promise<never> { throw new Error("not implemented"); }
  async removeToken(): Promise<void> { throw new Error("not implemented"); }
  async listTokensForProfile(): Promise<never[]> { throw new Error("not implemented"); }
  async getSetting(): Promise<null> { throw new Error("not implemented"); }
  async setSetting(): Promise<never> { throw new Error("not implemented"); }
  async listSettings(): Promise<never[]> { throw new Error("not implemented"); }
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
  async upsertHashes(): Promise<void> { throw new Error("not implemented"); }
  async findMatches(): Promise<never[]> { throw new Error("not implemented"); }
  async deleteForUser(): Promise<void> { throw new Error("not implemented"); }
  async deleteExpired(): Promise<void> { throw new Error("not implemented"); }
  async listByUser(): Promise<never[]> { throw new Error("not implemented"); }
}

class DrizzleListRepository implements ListRepository {
  constructor(private readonly db: HoneDb) {}
  async create(): Promise<never> { throw new Error("not implemented"); }
  async findById(): Promise<null> { throw new Error("not implemented"); }
  async listByOwner(): Promise<never[]> { throw new Error("not implemented"); }
  async update(): Promise<never> { throw new Error("not implemented"); }
  async delete(): Promise<void> { throw new Error("not implemented"); }
  async addItem(): Promise<never> { throw new Error("not implemented"); }
  async removeItem(): Promise<void> { throw new Error("not implemented"); }
  async listItems(): Promise<never[]> { throw new Error("not implemented"); }
  async reorderItems(): Promise<void> { throw new Error("not implemented"); }
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
  };
}

