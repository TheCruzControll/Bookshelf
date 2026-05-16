import type { CatalogMergeOutcome } from "./catalog-merge";
import type {
  AccountDeletion,
  ActivityEvent,
  Block,
  Book,
  BookSearchResult,
  ContentType,
  ContactsHash,
  EmailIndex,
  Edition,
  EntityId,
  Follow,
  HandleHistory,
  Import,
  ImportSource,
  ImportStatus,
  InAppNotification,
  List,
  ListItem,
  MagicLinkToken,
  NotificationPlatform,
  NotificationSetting,
  NotificationToken,
  NotificationTrigger,
  Ranking,
  FeedItem,
  Profile,
  Recommendation,
  Review,
  OAuthIdentity,
  Session,
  Shelf,
  ShelfAuthorType,
  ShelfItem,
  PhoneVerification,
  PhoneNumber,
  Salt,
  Visibility
} from "./types";

export interface AuthIdentity {
  userId: EntityId;
  email?: string;
}

export interface AuthProvider {
  getCurrentIdentity(): Promise<AuthIdentity | null>;
}

export interface AppleJwk {
  kty: string;
  kid: string;
  use: string;
  alg: string;
  n: string;
  e: string;
}

export interface AppleJwksProvider {
  fetchKeys(): Promise<AppleJwk[]>;
}

export interface AppleTokenClaims {
  sub: string;
  email?: string;
  email_verified?: boolean | string;
  is_private_email?: boolean | string;
  nonce?: string;
  aud: string;
  iss: string;
  exp: number;
  iat: number;
}

export interface GoogleJwk {
  kty: string;
  kid: string;
  use: string;
  alg: string;
  n: string;
  e: string;
}

export interface GoogleJwksProvider {
  fetchKeys(): Promise<GoogleJwk[]>;
}

export interface GoogleTokenClaims {
  sub: string;
  email?: string;
  email_verified?: boolean | string;
  aud: string;
  iss: string;
  exp: number;
  iat: number;
  azp?: string;
}

/**
 * Port for object storage backing surfaces that must hand a binary blob
 * to the user via a time-limited URL — currently the GDPR data export
 * (issue #153). The production adapter is expected to upload to an
 * object store (S3, GCS, etc.) and return a presigned URL; the dev
 * adapter writes to a temporary directory and returns a `file://` URL
 * suitable for local testing.
 *
 * Implementations MUST honour `expiresInMs`: the returned URL must
 * cease to be valid by `expiresAt`. Callers should not need to specify
 * a bucket — the implementation owns its destination.
 */
export interface StorageProvider {
  putObject(input: {
    /** Storage key (path within the implementation's destination). */
    key: string;
    body: Uint8Array;
    contentType: string;
    /** How long the returned URL should remain valid, in milliseconds. */
    expiresInMs: number;
  }): Promise<{ url: string; expiresAt: Date }>;
}

export interface ProfileRepository {
  findById(id: EntityId): Promise<Profile | null>;
  findByHandle(handle: string): Promise<Profile | null>;
  create(input: {
    id: EntityId;
    handle: string;
    displayName: string;
    defaultVisibility: Record<ContentType, Visibility>;
  }): Promise<Profile>;
  isHandleTaken(handle: string): Promise<boolean>;
  setHandle(input: { userId: EntityId; handle: string }): Promise<Profile>;
}

export interface BookRepository {
  findBookById(id: EntityId): Promise<Book | null>;
  findEditionByIsbn(isbn: string): Promise<Edition | null>;
  /**
   * Find the Book whose Editions include the supplied ISBN-13 (matched
   * against `editions.isbn_13`). Returns `null` when no Edition matches.
   * Used by the edition merge logic to detect duplicates before deciding
   * whether to attach a new Edition to an existing Book.
   */
  findBookByIsbn13(isbn13: string): Promise<Book | null>;
  search(query: string, limit: number): Promise<Book[]>;
  /**
   * Persist a fresh catalog hit. Implements the F-06 (#72) merge rules:
   *
   *   1. If the result carries an ISBN-13 that matches an existing Edition,
   *      the new Edition is attached to that Edition's Book — we do not
   *      create a second Book row.
   *   2. If the matched Book was first seen via Google Books (no `olWorkId`)
   *      and the new result is an Open Library hit with a `workId`, the
   *      Book's `olWorkId` is back-filled from the result.
   *   3. The Edition row is upserted by `(source, sourceKey)` — repeated
   *      ingestion of the same catalog hit is idempotent.
   *
   * Implementations must perform the lookup + write atomically (one
   * transaction) so concurrent ingests of the same ISBN-13 cannot create
   * duplicate Book rows.
   */
  upsertFromCatalogResult(result: BookSearchResult): Promise<CatalogMergeOutcome>;
}

export interface ShelfRepository {
  listShelves(ownerId: EntityId, viewerId?: EntityId): Promise<Shelf[]>;
  findById(id: EntityId): Promise<Shelf | null>;
  create(input: {
    ownerId: EntityId;
    name: string;
    slug: string;
    visibility: Visibility;
  }): Promise<Shelf>;
  update(input: {
    id: EntityId;
    ownerId: EntityId;
    version: number;
    name?: string | undefined;
    visibility?: Visibility | undefined;
    description?: string | undefined;
    publishedAt?: Date | null | undefined;
    authorType?: ShelfAuthorType | undefined;
  }): Promise<Shelf>;
  delete(input: { id: EntityId; ownerId: EntityId }): Promise<void>;
  addBook(input: {
    ownerId: EntityId;
    shelfId: EntityId;
    bookId: EntityId;
    editionId?: EntityId | undefined;
  }): Promise<ShelfItem>;
  rankShelfItem(input: {
    ownerId: EntityId;
    shelfItemId: EntityId;
    rank: number;
  }): Promise<ShelfItem>;
  createSystemShelves(ownerId: EntityId): Promise<Shelf[]>;
  findShelfItem(input: { shelfId: EntityId; bookId: EntityId }): Promise<ShelfItem | null>;
  upsertShelfItem(input: {
    shelfId: EntityId;
    bookId: EntityId;
    editionId?: EntityId | undefined;
    notes?: string | undefined;
    position?: number | undefined;
  }): Promise<ShelfItem>;
  deleteShelfItem(input: { shelfId: EntityId; bookId: EntityId }): Promise<void>;
  getMaxPosition(shelfId: EntityId): Promise<number>;
  moveShelfItem(input: { shelfId: EntityId; bookId: EntityId; position: number }): Promise<ShelfItem>;
  /**
   * Given a set of candidate owners, return the subset whose system shelf
   * (matched by slug, e.g. "want-to-read") currently contains `bookId`.
   * Used by direct-social notification fan-out (#148) to find mutuals that
   * have a freshly-finished book on their Want-to-Read shelf.
   */
  listOwnersWithBookOnSystemShelf(input: {
    bookId: EntityId;
    slug: string;
    ownerIds: EntityId[];
  }): Promise<EntityId[]>;
  /**
   * List every `ShelfItem` belonging to a shelf owned by `ownerId`.
   * Used by the GDPR export builder (#153). Spans shelves of every
   * `kind` (system, custom, list) — lists are shelves with
   * `kind === "list"` in this schema.
   */
  listShelfItemsByOwner(ownerId: EntityId): Promise<ShelfItem[]>;
}

export interface ReviewRepository {
  findById(id: EntityId): Promise<Review | null>;
  create(input: {
    authorId: EntityId;
    bookId: EntityId;
    editionId?: EntityId | undefined;
    body: string;
    visibility: Visibility;
  }): Promise<Review>;
  update(input: {
    id: EntityId;
    authorId: EntityId;
    version: number;
    body?: string | undefined;
    visibility?: Visibility | undefined;
  }): Promise<Review>;
  delete(input: { id: EntityId; authorId: EntityId }): Promise<void>;
  /**
   * List every review authored by `authorId`. Used by the GDPR export
   * builder (#153); does not apply visibility filtering because the
   * caller is always the author themselves.
   */
  listByAuthor(authorId: EntityId): Promise<Review[]>;
}

export interface ActivityRepository {
  append(event: Omit<ActivityEvent, "id" | "occurredAt">): Promise<ActivityEvent>;
  getFriendFeed(input: {
    viewerId: EntityId;
    cursor?: string;
    limit: number;
  }): Promise<FeedItem[]>;
  /**
   * Fetch feed items for the viewer with group-boundary alignment.
   * Returns complete groups — never splits a group across pages.
   * The cursor encodes (groupKey, occurredAt) of the last group seen.
   */
  getFriendFeedGrouped(input: {
    viewerId: EntityId;
    /** Decoded cursor: events older than this occurredAt AND with a different groupKey */
    beforeOccurredAt?: Date;
    beforeGroupKey?: string;
    /** Target number of groups to return (may return more items) */
    groupLimit: number;
  }): Promise<FeedItem[]>;
  deleteByReviewId(reviewId: EntityId): Promise<void>;
  /**
   * List every activity event authored by `actorId`. Used by the GDPR
   * export builder (#153) — the caller is always the actor.
   */
  listByActor(actorId: EntityId): Promise<ActivityEvent[]>;
}

export interface RecommendationRepository {
  getForUser(userId: EntityId, limit: number): Promise<Recommendation[]>;
}

export interface FollowRepository {
  follow(input: { followerId: EntityId; followeeId: EntityId }): Promise<Follow>;
  unfollow(input: { followerId: EntityId; followeeId: EntityId }): Promise<void>;
  findFollow(input: { followerId: EntityId; followeeId: EntityId }): Promise<Follow | null>;
  listFollowers(userId: EntityId, viewerId?: EntityId): Promise<Follow[]>;
  listFollowing(userId: EntityId, viewerId?: EntityId): Promise<Follow[]>;
  isMutual(input: { userA: EntityId; userB: EntityId }): Promise<boolean>;
  countMutuals(userId: EntityId): Promise<number>;
  /**
   * List the profile IDs of `userId`'s mutual follows (users who follow `userId`
   * and whom `userId` also follows). Used by direct-social notification fan-out
   * (#148) so the caller can enqueue per-recipient pushes.
   */
  listMutualIds(userId: EntityId): Promise<EntityId[]>;
}

export interface BlockRepository {
  block(input: { blockerId: EntityId; blockedId: EntityId }): Promise<Block>;
  unblock(input: { blockerId: EntityId; blockedId: EntityId }): Promise<void>;
  findBlock(input: { blockerId: EntityId; blockedId: EntityId }): Promise<Block | null>;
  listBlockedByUser(blockerId: EntityId): Promise<Block[]>;
  listBlockingUser(blockedId: EntityId): Promise<Block[]>;
  isBlocked(input: { viewerId: EntityId; targetId: EntityId }): Promise<boolean>;
}

export interface RankingRepository {
  upsert(input: {
    ownerId: EntityId;
    bookId: EntityId;
    rank: number;
    score: number;
  }): Promise<Ranking>;
  findById(id: EntityId): Promise<Ranking | null>;
  findByOwnerAndBook(input: { ownerId: EntityId; bookId: EntityId }): Promise<Ranking | null>;
  listByOwner(ownerId: EntityId, viewerId?: EntityId): Promise<Ranking[]>;
  delete(input: { ownerId: EntityId; bookId: EntityId }): Promise<void>;
  startBucket(input: {
    ownerId: EntityId;
    bookId: EntityId;
    bucket: number;
  }): Promise<Ranking>;
}

export interface NotificationRepository {
  registerToken(input: {
    profileId: EntityId;
    platform: NotificationPlatform;
    token: string;
  }): Promise<NotificationToken>;
  removeToken(input: { profileId: EntityId; token: string }): Promise<void>;
  listTokensForProfile(profileId: EntityId): Promise<NotificationToken[]>;
  getSetting(input: { profileId: EntityId; key: string }): Promise<NotificationSetting | null>;
  setSetting(input: { profileId: EntityId; key: string; value: unknown }): Promise<NotificationSetting>;
  listSettings(profileId: EntityId): Promise<NotificationSetting[]>;
}

export interface InAppNotificationRepository {
  list(input: {
    recipientId: EntityId;
    cursor?: string;
    limit: number;
  }): Promise<InAppNotification[]>;
  markRead(input: {
    recipientId: EntityId;
    notificationId: EntityId;
  }): Promise<void>;
  findById(id: EntityId): Promise<InAppNotification | null>;
  /**
   * Insert a new in-app notification record. The in-app surface persists
   * everything regardless of push status (per Q17 spec), so this is invoked
   * once per direct-social event the platform produces.
   */
  create(input: {
    recipientId: EntityId;
    actorId?: EntityId | undefined;
    trigger: NotificationTrigger;
    payload: Record<string, unknown>;
  }): Promise<InAppNotification>;
  /** Count notifications delivered to recipient at or after `since`. Used for rate-cap enforcement. */
  countSince(input: { recipientId: EntityId; since: Date }): Promise<number>;
  /** Count notifications produced by actor for recipient at or after `since`. Used for per-actor rate-cap enforcement. */
  countSinceByActor(input: {
    recipientId: EntityId;
    actorId: EntityId;
    since: Date;
  }): Promise<number>;
  /**
   * List every in-app notification delivered to `recipientId`, ordered
   * newest first. Used by the GDPR export builder (#153); intentionally
   * unpaginated because the export is a one-off snapshot.
   */
  listAllByRecipient(recipientId: EntityId): Promise<InAppNotification[]>;
}

export interface ImportRepository {
  create(input: {
    id: EntityId;
    ownerId: EntityId;
    source: ImportSource;
    idempotencyHash?: string | undefined;
  }): Promise<Import>;
  findById(id: EntityId): Promise<Import | null>;
  findByOwnerAndHash(input: { ownerId: EntityId; hash: string }): Promise<Import | null>;
  listByOwner(ownerId: EntityId): Promise<Import[]>;
  updateStatus(input: {
    id: EntityId;
    status: ImportStatus;
    completedAt?: Date | undefined;
  }): Promise<Import>;
}

export interface ContactsRepository {
  upsertHashes(input: {
    userId: EntityId;
    hashes: Array<{ hash: string; saltVersion: number; expiresAt: Date }>;
  }): Promise<void>;
  findMatches(input: {
    hashes: string[];
    excludeUserId: EntityId;
  }): Promise<EntityId[]>;
  /**
   * Join `contacts_index` against `phone_numbers` for the viewer's stored
   * contact hashes. Returns the Hone profile IDs whose normalized phone
   * hash matches any of the viewer's previously-uploaded contact hashes
   * (excluding the viewer themselves and expired hashes).
   */
  findMatchingProfilesByPhone(viewerId: EntityId): Promise<EntityId[]>;
  deleteForUser(userId: EntityId): Promise<void>;
  deleteExpired(): Promise<void>;
  /** Mark all hashes created under a given salt version as expiring at the given date */
  expireBySaltVersion(saltVersion: number, expiresAt: Date): Promise<number>;
  deleteByTargetHash(hashes: string[]): Promise<void>;
  listByUser(userId: EntityId): Promise<ContactsHash[]>;
  /**
   * Mark all of a user's `contacts_index` rows as disabled at the given
   * timestamp. Soft-delete primitive for `contacts.disableSync` (#98); rows
   * remain on disk until `purgeOlderThan` removes them at least 24h later.
   */
  softDisable(input: { userId: EntityId; now: Date }): Promise<void>;
  /**
   * Hard-delete every `contacts_index` row whose `disabled_at` is older
   * than the given cutoff. Idempotent. Returns the number of rows deleted.
   */
  purgeOlderThan(cutoff: Date): Promise<number>;
}

export interface EmailIndexRepository {
  upsertHashes(input: {
    userId: EntityId;
    hashes: Array<{ hash: string; saltVersion: number; expiresAt: Date }>;
  }): Promise<void>;
  findMatches(input: {
    hashes: string[];
    excludeUserId: EntityId;
  }): Promise<EntityId[]>;
  deleteForUser(userId: EntityId): Promise<void>;
  deleteExpired(): Promise<void>;
  /** Mark all hashes created under a given salt version as expiring at the given date */
  expireBySaltVersion(saltVersion: number, expiresAt: Date): Promise<number>;
  deleteByTargetHash(hashes: string[]): Promise<void>;
  listByUser(userId: EntityId): Promise<EmailIndex[]>;
}

export interface ListRepository {
  create(input: {
    id: EntityId;
    ownerId: EntityId;
    title: string;
    description?: string | undefined;
    visibility: Visibility;
  }): Promise<List>;
  findById(id: EntityId, viewerId?: EntityId): Promise<List | null>;
  listByOwner(ownerId: EntityId, viewerId?: EntityId): Promise<List[]>;
  update(input: {
    id: EntityId;
    ownerId: EntityId;
    title?: string | undefined;
    description?: string | undefined;
    visibility?: Visibility | undefined;
  }): Promise<List>;
  delete(input: { id: EntityId; ownerId: EntityId }): Promise<void>;
  addItem(input: {
    listId: EntityId;
    bookId: EntityId;
    position: number;
  }): Promise<ListItem>;
  removeItem(input: { listId: EntityId; bookId: EntityId }): Promise<void>;
  listItems(listId: EntityId): Promise<ListItem[]>;
  reorderItems(input: { listId: EntityId; orderedBookIds: EntityId[] }): Promise<void>;
}

export interface AuthIdentityRepository {
  create(input: {
    provider: string;
    providerUserId: string;
    profileId: EntityId;
  }): Promise<OAuthIdentity>;
  findByProvider(input: { provider: string; providerUserId: string }): Promise<OAuthIdentity | null>;
  listByProfile(profileId: EntityId): Promise<OAuthIdentity[]>;
}

export interface SessionRepository {
  create(input: {
    tokenHash: string;
    profileId: EntityId;
    expiresAt: Date;
  }): Promise<Session>;
  findByTokenHash(tokenHash: string): Promise<Session | null>;
  revokeByTokenHash(tokenHash: string): Promise<void>;
  revokeAllForProfile(profileId: EntityId): Promise<void>;
}

export interface HandleHistoryRepository {
  record(input: {
    profileId: EntityId;
    oldHandle: string;
    retiredAt: Date;
    expiresAt: Date;
  }): Promise<HandleHistory>;
  findCurrentByOldHandle(oldHandle: string): Promise<HandleHistory | null>;
}

export interface MagicLinkRepository {
  create(input: {
    email: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<MagicLinkToken>;
  findByTokenHash(tokenHash: string): Promise<MagicLinkToken | null>;
  markConsumed(tokenHash: string): Promise<void>;
  deleteExpiredForEmail(email: string): Promise<void>;
}

export interface EmailProvider {
  sendMagicLink(input: { to: string; token: string; expiresInMinutes: number }): Promise<void>;
}

export interface SmsProvider {
  sendVerificationCode(input: { to: string; code: string }): Promise<void>;
}

export interface PhoneVerificationRepository {
  upsert(input: {
    phoneE164: string;
    codeHash: string;
    attempts: number;
    expiresAt: Date;
  }): Promise<PhoneVerification>;
  findByPhone(phoneE164: string): Promise<PhoneVerification | null>;
  incrementAttempts(phoneE164: string): Promise<PhoneVerification>;
  deleteByPhone(phoneE164: string): Promise<void>;
  deleteExpired(): Promise<void>;
}

export interface PhoneNumberRepository {
  upsert(input: { profileId: EntityId; e164Hash: string }): Promise<PhoneNumber>;
  findByProfileId(profileId: EntityId): Promise<PhoneNumber | null>;
  findByHash(e164Hash: string): Promise<PhoneNumber | null>;
}
/**
 * Port for generating new HMAC key material.
 * Implemented by AWS KMS adapter in production and a local random stub in dev.
 */
export interface SaltKeyProvider {
  /** Generate a new HMAC key — returns the raw key material as a hex string */
  generateKey(): Promise<string>;
}

export interface SaltRepository {
  /** Insert a new salt version */
  create(input: {
    version: number;
    keyMaterial: string;
    activeFrom: Date;
    activeTo?: Date | undefined;
  }): Promise<Salt>;
  /** Find the currently active salt (activeFrom <= now, activeTo is null or > now) */
  findActive(): Promise<Salt | null>;
  /** Find a salt by its version number */
  findByVersion(version: number): Promise<Salt | null>;
  /** Retire a salt by setting its activeTo timestamp */
  retire(input: { version: number; activeTo: Date }): Promise<Salt>;
  /** Get the latest salt version number */
  getLatestVersion(): Promise<number>;
  /** List all salts ordered by version desc */
  listAll(): Promise<Salt[]>;
}

export interface AccountDeletionRepository {
  create(input: {
    profileId: EntityId;
    requestedAt: Date;
    hardDeleteAfter: Date;
  }): Promise<AccountDeletion>;
  findByProfileId(profileId: EntityId): Promise<AccountDeletion | null>;
  delete(profileId: EntityId): Promise<void>;
  /**
   * List deletion records whose grace period has elapsed
   * (hardDeleteAfter <= now). Used by the hard-delete cron.
   */
  listExpired(now: Date): Promise<AccountDeletion[]>;
  /**
   * Hard-delete every user-scoped row for the given profile in a single
   * transaction. Deletes (in dependency order): reviews, ranking signals,
   * activity events, shelf_items belonging to the user's shelves/lists,
   * shelves (which covers lists, since lists are shelves with kind="list"),
   * taste vectors, recommendation scores, push tokens, notification
   * settings, in-app notifications (both as recipient and actor),
   * follows (either side), blocks placed by the user, oauth identities,
   * phone numbers, contacts index, email index, handle history, sessions,
   * imports, the profile row, and finally the account_deletions row.
   *
   * Note: retention of `blocks` placed AGAINST the user (so re-signups
   * with the same hashed phone re-trigger blocks) is handled by issue
   * #154 via the `blocks_against_hash` table; this method leaves those
   * rows untouched.
   */
  purgeProfile(profileId: EntityId): Promise<void>;
}

export interface AppRepositories {
  accountDeletions: AccountDeletionRepository;
  profiles: ProfileRepository;
  books: BookRepository;
  shelves: ShelfRepository;
  reviews: ReviewRepository;
  activity: ActivityRepository;
  recommendations: RecommendationRepository;
  follows: FollowRepository;
  blocks: BlockRepository;
  rankings: RankingRepository;
  notifications: NotificationRepository;
  imports: ImportRepository;
  contacts: ContactsRepository;
  emailIndex: EmailIndexRepository;
  lists: ListRepository;
  authIdentities: AuthIdentityRepository;
  sessions: SessionRepository;
  handleHistory: HandleHistoryRepository;
  magicLinks: MagicLinkRepository;
  inAppNotifications: InAppNotificationRepository;
  phoneVerifications: PhoneVerificationRepository;
  phoneNumbers: PhoneNumberRepository;

  salts: SaltRepository;
}

export interface BlockFilter {
  removeBlocked<T extends { id: EntityId }>(viewerId: EntityId, items: T[]): Promise<T[]>;
}

export interface CatalogProvider {
  search(query: string, limit: number): Promise<BookSearchResult[]>;
  lookupByIsbn(isbn: string): Promise<BookSearchResult | null>;
}
