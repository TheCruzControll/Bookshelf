import { and, desc, eq, ilike, or } from "drizzle-orm";
import type {
  ActivityRepository,
  AppRepositories,
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
import type { HoneDb } from "./client";
import {
  activityEvents,
  books,
  editions,
  follows,
  profiles,
  recommendationScores,
  reviews,
  shelfItems,
  shelves
} from "./schema";
import {
  toActivityEvent,
  toBook,
  toEdition,
  toProfile,
  toReview,
  toShelf,
  toShelfItem
} from "./mappers";

export class VersionConflictError extends Error {
  readonly code = "VERSION_CONFLICT" as const;
  constructor(entity: string, id: string) {
    super(`Stale ${entity} edit: version mismatch for id ${id}`);
    this.name = "VersionConflictError";
  }
}

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

  async update(input: Parameters<ProfileRepository["update"]>[0]) {
    const { id, version, ...fields } = input;
    const [row] = await this.db
      .update(profiles)
      .set({ ...fields, version: version + 1, updatedAt: new Date() })
      .where(and(eq(profiles.id, id), eq(profiles.version, version)))
      .returning();
    if (!row) {
      throw new VersionConflictError("profile", id);
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

  async update(input: Parameters<ShelfRepository["update"]>[0]) {
    const { id, ownerId, version, ...fields } = input;
    const [row] = await this.db
      .update(shelves)
      .set({ ...fields, version: version + 1, updatedAt: new Date() })
      .where(
        and(
          eq(shelves.id, id),
          eq(shelves.ownerId, ownerId),
          eq(shelves.version, version)
        )
      )
      .returning();
    if (!row) {
      throw new VersionConflictError("shelf", id);
    }
    return toShelf(row);
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
    const { id, authorId, version, ...fields } = input;
    const [row] = await this.db
      .update(reviews)
      .set({ ...fields, version: version + 1, updatedAt: new Date() })
      .where(
        and(
          eq(reviews.id, id),
          eq(reviews.authorId, authorId),
          eq(reviews.version, version)
        )
      )
      .returning();
    if (!row) {
      throw new VersionConflictError("review", id);
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
  async findByOwnerAndBook(): Promise<null> { throw new Error("not implemented"); }
  async listByOwner(): Promise<never[]> { throw new Error("not implemented"); }
  async delete(): Promise<void> { throw new Error("not implemented"); }
}

class DrizzleNotificationRepository implements NotificationRepository {
  constructor(private readonly db: HoneDb) {}
  async registerToken(): Promise<never> { throw new Error("not implemented"); }
  async removeToken(): Promise<void> { throw new Error("not implemented"); }
  async listTokensForUser(): Promise<never[]> { throw new Error("not implemented"); }
}

class DrizzleImportRepository implements ImportRepository {
  constructor(private readonly db: HoneDb) {}
  async create(): Promise<never> { throw new Error("not implemented"); }
  async findById(): Promise<null> { throw new Error("not implemented"); }
  async listByOwner(): Promise<never[]> { throw new Error("not implemented"); }
  async updateStatus(): Promise<never> { throw new Error("not implemented"); }
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

class DrizzleSessionRepository implements SessionRepository {
  constructor(private readonly db: HoneDb) {}
  async create(): Promise<never> { throw new Error("not implemented"); }
  async findById(): Promise<null> { throw new Error("not implemented"); }
  async deleteById(): Promise<void> { throw new Error("not implemented"); }
  async deleteAllForUser(): Promise<void> { throw new Error("not implemented"); }
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
    sessions: new DrizzleSessionRepository(db),
  };
}
