import type {
  AccountDeletion,
  ActivityEvent,
  DeletedProfileTombstone,
  Block,
  BlockAgainstHash,
  Book,
  ContentType,
  ContactIndex,
  Edition,
  EmailIndex,
  Follow,
  HandleHistory,
  Import,
  InAppNotification,
  List,
  ListItem,
  MagicLinkToken,
  NotificationSetting,
  NotificationToken,
  OAuthIdentity,
  PhoneNumber,
  PhoneVerification,
  Profile,
  Ranking,
  Salt,
  Review,
  Session,
  Shelf,
  ShelfItem,
  Visibility
} from "@hone/domain";
import type {
  accountDeletions,
  activityEvents,
  deletedProfileTombstones,
  authIdentities,
  blocks,
  blocksAgainstHash,
  books,
  contactsIndex,
  editions,
  emailIndex,
  follows,
  handleHistory,
  inAppNotifications,
  imports,
  magicLinkTokens,
  notificationSettings,
  notificationTokens,
  phoneNumbers,
  phoneVerifications,
  profiles,
  rankings,
  reviews,
  salts,
  sessions,
  shelfItems,
  shelves
} from "./schema";

type AccountDeletionRow = typeof accountDeletions.$inferSelect;
type DeletedProfileTombstoneRow = typeof deletedProfileTombstones.$inferSelect;
type FollowRow = typeof follows.$inferSelect;
type ContactIndexRow = typeof contactsIndex.$inferSelect;
type EmailIndexRow = typeof emailIndex.$inferSelect;
type NotificationTokenRow = typeof notificationTokens.$inferSelect;
type NotificationSettingRow = typeof notificationSettings.$inferSelect;
type AuthIdentityRow = typeof authIdentities.$inferSelect;
type BlockRow = typeof blocks.$inferSelect;
type BlockAgainstHashRow = typeof blocksAgainstHash.$inferSelect;
type PhoneVerificationRow = typeof phoneVerifications.$inferSelect;
type PhoneNumberRow = typeof phoneNumbers.$inferSelect;
type ProfileRow = typeof profiles.$inferSelect;
type BookRow = typeof books.$inferSelect;
type EditionRow = typeof editions.$inferSelect;
type ShelfRow = typeof shelves.$inferSelect;
type ShelfItemRow = typeof shelfItems.$inferSelect;
type ReviewRow = typeof reviews.$inferSelect;
type RankingRow = typeof rankings.$inferSelect;
type ActivityRow = typeof activityEvents.$inferSelect;
type ImportRow = typeof imports.$inferSelect;
type SessionRow = typeof sessions.$inferSelect;
type HandleHistoryRow = typeof handleHistory.$inferSelect;
type MagicLinkTokenRow = typeof magicLinkTokens.$inferSelect;

export function toAccountDeletion(row: AccountDeletionRow): AccountDeletion {
  return {
    profileId: row.profileId,
    requestedAt: row.requestedAt,
    hardDeleteAfter: row.hardDeleteAfter,
    exportedAt: row.exportedAt ?? undefined
  };
}

export function toDeletedProfileTombstone(
  row: DeletedProfileTombstoneRow
): DeletedProfileTombstone {
  return {
    profileId: row.profileId,
    handle: row.handle,
    deletedAt: row.deletedAt,
    expiresAt: row.expiresAt
  };
}

export function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.displayName,
    bio: row.bio ?? undefined,
    avatarUrl: row.avatarUrl ?? undefined,
    verified: row.verified,
    defaultVisibility: row.defaultVisibility as Record<ContentType, Visibility>,
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
    olWorkId: row.olWorkId ?? undefined,
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
    occurredAt: row.occurredAt,
    scoreAtPublish: row.scoreAtPublish != null ? Number(row.scoreAtPublish) : undefined,
    scoreLockedAtPublish: row.scoreLockedAtPublish ?? undefined,
    groupKey: row.groupKey ?? undefined
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

export function toPhoneVerification(row: PhoneVerificationRow): PhoneVerification {
  return {
    phoneE164: row.phoneE164,
    codeHash: row.codeHash,
    attempts: row.attempts,
    expiresAt: row.expiresAt
  };
}

export function toPhoneNumber(row: PhoneNumberRow): PhoneNumber {
  return {
    profileId: row.profileId,
    e164Hash: row.e164Hash
  };
}

export function toOAuthIdentity(row: AuthIdentityRow): OAuthIdentity {
  return {
    provider: row.provider,
    providerUserId: row.providerUserId,
    profileId: row.profileId
  };
}

export function toSession(row: SessionRow): Session {
  return {
    tokenHash: row.tokenHash,
    profileId: row.profileId,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt ?? undefined
  };
}

export function toContactIndex(row: ContactIndexRow): ContactIndex {
  return {
    profileId: row.profileId,
    contactHash: row.contactHash,
    saltVersion: row.saltVersion,
    expiresAt: row.expiresAt
  };
}

export function toEmailIndex(row: EmailIndexRow): EmailIndex {
  return {
    profileId: row.profileId,
    emailHash: row.emailHash,
    saltVersion: row.saltVersion,
    expiresAt: row.expiresAt
  };
}

export function toNotificationToken(row: NotificationTokenRow): NotificationToken {
  return {
    profileId: row.profileId,
    platform: row.platform,
    token: row.token,
    lastSeen: row.lastSeen
  };
}

export function toNotificationSetting(row: NotificationSettingRow): NotificationSetting {
  return {
    profileId: row.profileId,
    key: row.key,
    value: row.value
  };
}

export function toHandleHistory(row: HandleHistoryRow): HandleHistory {
  return {
    id: row.id,
    profileId: row.profileId,
    oldHandle: row.oldHandle,
    retiredAt: row.retiredAt,
    expiresAt: row.expiresAt
  };
}

type SaltRow = typeof salts.$inferSelect;

export function toSalt(row: SaltRow): Salt {
  return {
    id: row.id,
    version: row.version,
    keyMaterial: row.keyMaterial,
    activeFrom: row.activeFrom,
    activeTo: row.activeTo ?? undefined,
    createdAt: row.createdAt,
  };
}

export function toFollow(row: FollowRow): Follow {
  return {
    id: `${row.followerId}:${row.followeeId}`,
    followerId: row.followerId,
    followeeId: row.followeeId,
    createdAt: row.createdAt
  };
}

export function toList(row: ShelfRow): List {
  return {
    id: row.id,
    ownerId: row.ownerId,
    title: row.name,
    description: row.description ?? undefined,
    visibility: row.visibility,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export function toListItem(row: ShelfItemRow): ListItem {
  return {
    id: row.id,
    listId: row.shelfId,
    bookId: row.bookId,
    position: row.position ?? 0,
    addedAt: row.addedAt
  };
}

export function toMagicLinkToken(row: MagicLinkTokenRow): MagicLinkToken {
  return {
    email: row.email,
    tokenHash: row.tokenHash,
    expiresAt: row.expiresAt,
    consumedAt: row.consumedAt ?? undefined
  };
}

type InAppNotificationRow = typeof inAppNotifications.$inferSelect;

export function toInAppNotification(row: InAppNotificationRow): InAppNotification {
  return {
    id: row.id,
    recipientId: row.recipientId,
    actorId: row.actorId ?? undefined,
    trigger: row.trigger,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    readAt: row.readAt ?? undefined,
    createdAt: row.createdAt,
  };
}
