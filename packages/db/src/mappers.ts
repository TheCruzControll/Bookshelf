import type {
  ActivityEvent,
  Book,
  Edition,
  Profile,
  Review,
  Shelf,
  ShelfItem
} from "@bookshelf/domain";
import type {
  activityEvents,
  books,
  editions,
  profiles,
  reviews,
  shelfItems,
  shelves
} from "./schema";

type ProfileRow = typeof profiles.$inferSelect;
type BookRow = typeof books.$inferSelect;
type EditionRow = typeof editions.$inferSelect;
type ShelfRow = typeof shelves.$inferSelect;
type ShelfItemRow = typeof shelfItems.$inferSelect;
type ReviewRow = typeof reviews.$inferSelect;
type ActivityRow = typeof activityEvents.$inferSelect;

export function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.displayName,
    bio: row.bio ?? undefined,
    avatarUrl: row.avatarUrl ?? undefined,
    defaultVisibility: row.defaultVisibility,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export function toBook(row: BookRow): Book {
  return {
    id: row.id,
    canonicalTitle: row.canonicalTitle,
    subtitle: row.subtitle ?? undefined,
    description: row.description ?? undefined,
    coverUrl: row.coverUrl ?? undefined,
    firstPublishedYear: row.firstPublishedYear ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export function toEdition(row: EditionRow): Edition {
  return {
    id: row.id,
    bookId: row.bookId,
    isbn10: row.isbn10 ?? undefined,
    isbn13: row.isbn13 ?? undefined,
    title: row.title,
    publisher: row.publisher ?? undefined,
    publishedDate: row.publishedDate ?? undefined,
    pageCount: row.pageCount ?? undefined,
    source: row.source as Edition["source"],
    sourceKey: row.sourceKey ?? undefined
  };
}

export function toShelf(row: ShelfRow): Shelf {
  return {
    id: row.id,
    ownerId: row.ownerId,
    name: row.name,
    slug: row.slug,
    visibility: row.visibility,
    isSystem: row.isSystem,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export function toShelfItem(row: ShelfItemRow): ShelfItem {
  return {
    id: row.id,
    shelfId: row.shelfId,
    bookId: row.bookId,
    editionId: row.editionId ?? undefined,
    status: row.status,
    rank: row.rank ?? undefined,
    addedAt: row.addedAt,
    updatedAt: row.updatedAt
  };
}

export function toReview(row: ReviewRow): Review {
  return {
    id: row.id,
    authorId: row.authorId,
    bookId: row.bookId,
    editionId: row.editionId ?? undefined,
    body: row.body,
    visibility: row.visibility,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export function toActivityEvent(row: ActivityRow): ActivityEvent {
  return {
    id: row.id,
    actorId: row.actorId,
    verb: row.verb,
    bookId: row.bookId ?? undefined,
    shelfId: row.shelfId ?? undefined,
    reviewId: row.reviewId ?? undefined,
    visibility: row.visibility,
    occurredAt: row.occurredAt
  };
}

