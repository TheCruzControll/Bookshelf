import { and, desc, eq, ilike, or } from "drizzle-orm";
import type {
  ActivityRepository,
  AppRepositories,
  BookRepository,
  EntityId,
  FeedItem,
  ProfileRepository,
  Recommendation,
  RecommendationRepository,
  ReviewRepository,
  ShelfRepository
} from "@hone/domain";
import type { HoneDb } from "./client";
import {
  activityEvents,
  books,
  editions,
  friendships,
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
    const friendRows = await this.db
      .select({
        requesterId: friendships.requesterId,
        addresseeId: friendships.addresseeId
      })
      .from(friendships)
      .where(
        and(
          eq(friendships.status, "accepted"),
          or(
            eq(friendships.requesterId, input.viewerId),
            eq(friendships.addresseeId, input.viewerId)
          )
        )
      );

    const friendIds = friendRows.map((friendship) =>
      friendship.requesterId === input.viewerId
        ? friendship.addresseeId
        : friendship.requesterId
    );

    if (friendIds.length === 0) {
      return [];
    }

    const rows = await this.db
      .select()
      .from(activityEvents)
      .where(eq(activityEvents.visibility, "friends"))
      .orderBy(desc(activityEvents.occurredAt))
      .limit(input.limit);

    const friendEvents = rows
      .filter((row) => friendIds.includes(row.actorId))
      .map(toActivityEvent);

    const feedItems: FeedItem[] = friendEvents.map((event) => ({ event, actor: {
      id: event.actorId,
      handle: "unknown",
      displayName: "Unknown reader",
      defaultVisibility: "friends",
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

export function createDrizzleRepositories(db: HoneDb): AppRepositories {
  return {
    profiles: new DrizzleProfileRepository(db),
    books: new DrizzleBookRepository(db),
    shelves: new DrizzleShelfRepository(db),
    reviews: new DrizzleReviewRepository(db),
    activity: new DrizzleActivityRepository(db),
    recommendations: new DrizzleRecommendationRepository(db)
  };
}

