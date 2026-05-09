import type {
  AccountDeletion,
  ActivityEvent,
  Block,
  BlockAgainstHash,
  Book,
  Edition,
  Import,
  Profile,
  Ranking,
  Review,
  Shelf,
  ShelfItem
} from "@hone/domain";
import type {
  accountDeletions,
  activityEvents,
  blocks,
  blocksAgainstHash,
  books,
  editions,
  imports,
  profiles,
  rankings,
  reviews,
  shelfItems,
  shelves
} from "./schema";

type AccountDeletionRow = typeof accountDeletions.$inferSelect;
type BlockRow = typeof blocks.$inferSelect;
type BlockAgainstHashRow = typeof blocksAgainstHash.$inferSelect;
type ProfileRow = typeof profiles.$inferSelect;
type BookRow = typeof books.$inferSelect;
type EditionRow = typeof editions.$inferSelect;
type ShelfRow = typeof shelves.$inferSelect;
type ShelfItemRow = typeof shelfItems.$inferSelect;
type ReviewRow = typeof reviews.$inferSelect;
type RankingRow = typeof rankings.$inferSelect;
type ActivityRow = typeof activityEvents.$inferSelect;
type ImportRow = typeof imports.$inferSelect;

export function toAccountDeletion(row: AccountDeletionRow): AccountDeletion {
  return {
    profileId: row.profileId,
    requestedAt: row.requestedAt,
    hardDeleteAfter: row.hardDeleteAfter,
    exportedAt: row.exportedAt ?? undefined
  };
}

export function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.displayName,
    bio: row.bio ?? undefined,
    avatarUrl: row.avatarUrl ?? undefined,
    defaultVisibility: row.defaultVisibility,
    version: row.version,
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
    kind: row.kind,
    authorType: row.authorType,
    curatorTier: row.curatorTier ?? undefined,
    description: row.description ?? undefined,
    publishedAt: row.publishedAt ?? undefined,
    version: row.version,
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
    notes: row.notes ?? undefined,
    position: row.position ?? undefined,
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
    version: row.version,
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

export function toImport(row: ImportRow): Import {
  return {
    id: row.id,
    ownerId: row.ownerId,
    source: row.source as Import["source"],
    idempotencyHash: row.idempotencyHash ?? undefined,
    conflictCount: row.conflictCount,
    status: row.status as Import["status"],
    createdAt: row.createdAt,
    completedAt: row.completedAt ?? undefined
  };
}

export function toRanking(row: RankingRow): Ranking {
  return {
    id: row.id,
    profileId: row.profileId,
    bookId: row.bookId,
    position: row.position,
    score: Number(row.score),
    bucket: row.bucket,
    lockedAt: row.lockedAt ?? undefined,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export function toBlock(row: BlockRow): Block {
  return {
    id: `${row.blockerId}:${row.blockedId}`,
    blockerId: row.blockerId,
    blockedId: row.blockedId,
    createdAt: row.createdAt
  };
}

export function toBlockAgainstHash(row: BlockAgainstHashRow): BlockAgainstHash {
  return {
    hash: row.hash,
    expiresAt: row.expiresAt
  };
}
