export type EntityId = string;

export type Visibility = "public" | "followers" | "mutuals" | "private";

export type ContentType =
  | "identity"
  | "follower_list"
  | "review"
  | "score"
  | "finished_shelf"
  | "custom_shelf"
  | "want_to_read_shelf"
  | "reading_shelf"
  | "dropped_shelf"
  | "reading_status"
  | "activity_stream";

export type ReadingStatus =
  | "want_to_read"
  | "reading"
  | "finished"
  | "dropped";

export type ShelfKind = "system" | "custom" | "list";

export type ShelfAuthorType = "user" | "internal_editorial" | "algorithmic";

export type ActivityVerb =
  | "book_added"
  | "book_started"
  | "book_finished"
  | "book_dropped"
  | "book_ranked"
  | "book_reviewed"
  | "shelf_updated";

export type ImportStatus =
  | "pending"
  | "processing"
  | "needs_review"
  | "completed"
  | "failed";

export type ImportSource = "goodreads" | "manual";

export type NotificationPlatform = "apns" | "fcm";

export type NotificationTrigger =
  | "new_follower"
  | "mutual_follow_back"
  | "mutual_rated_high"
  | "mutual_finished_want_to_read"
  | "security_event";

export interface InAppNotification {
  id: EntityId;
  recipientId: EntityId;
  actorId?: EntityId | undefined;
  trigger: NotificationTrigger;
  payload: Record<string, unknown>;
  readAt?: Date | undefined;
  createdAt: Date;
}

export type BlockDirection = "outgoing" | "incoming";

export interface Profile {
  id: EntityId;
  handle: string;
  displayName: string;
  bio?: string | undefined;
  avatarUrl?: string | undefined;
  verified: boolean;
  defaultVisibility: Record<ContentType, Visibility>;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Author {
  id: EntityId;
  name: string;
}

export interface Book {
  id: EntityId;
  canonicalTitle: string;
  subtitle?: string | undefined;
  description?: string | undefined;
  coverUrl?: string | undefined;
  firstPublishedYear?: number | undefined;
  genres?: string[] | undefined;
  createdAt: Date;
  updatedAt: Date;
}

export interface Edition {
  id: EntityId;
  bookId: EntityId;
  isbn10?: string | undefined;
  isbn13?: string | undefined;
  title: string;
  publisher?: string | undefined;
  publishedDate?: string | undefined;
  pageCount?: number | undefined;
  source: "open_library" | "google_books" | "manual";
  sourceKey?: string | undefined;
}

export interface Shelf {
  id: EntityId;
  ownerId: EntityId;
  name: string;
  slug: string;
  visibility: Visibility;
  isSystem: boolean;
  kind: ShelfKind;
  authorType: ShelfAuthorType;
  curatorTier?: number | undefined;
  description?: string | undefined;
  publishedAt?: Date | undefined;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ShelfItem {
  id: EntityId;
  shelfId: EntityId;
  bookId: EntityId;
  editionId?: EntityId | undefined;
  status: ReadingStatus;
  rank?: number | undefined;
  notes?: string | undefined;
  position?: number | undefined;
  addedAt: Date;
  updatedAt: Date;
}

export interface Review {
  id: EntityId;
  authorId: EntityId;
  bookId: EntityId;
  editionId?: EntityId | undefined;
  body: string;
  visibility: Visibility;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ActivityEvent {
  id: EntityId;
  actorId: EntityId;
  verb: ActivityVerb;
  bookId?: EntityId | undefined;
  shelfId?: EntityId | undefined;
  reviewId?: EntityId | undefined;
  visibility: Visibility;
  occurredAt: Date;
  scoreAtPublish?: number | undefined;
  scoreLockedAtPublish?: boolean | undefined;
  groupKey?: string | undefined;
}

export interface FeedItem {
  event: ActivityEvent;
  actor: Profile;
  book?: Book | undefined;
  shelf?: Shelf | undefined;
  review?: Review | undefined;
}

export interface Recommendation {
  book: Book;
  score: number;
  reason: string;
}

export interface Follow {
  id: EntityId;
  followerId: EntityId;
  followeeId: EntityId;
  createdAt: Date;
}

export interface Block {
  id: EntityId;
  blockerId: EntityId;
  blockedId: EntityId;
  createdAt: Date;
}

export interface BlockAgainstHash {
  hash: string;
  expiresAt: Date;
}

export interface Ranking {
  id: EntityId;
  profileId: EntityId;
  bookId: EntityId;
  position: number;
  score: number;
  bucket: number;
  lockedAt?: Date | undefined;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface List {
  id: EntityId;
  ownerId: EntityId;
  title: string;
  description?: string | undefined;
  visibility: Visibility;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListItem {
  id: EntityId;
  listId: EntityId;
  bookId: EntityId;
  position: number;
  addedAt: Date;
}

export interface NotificationToken {
  profileId: EntityId;
  platform: NotificationPlatform;
  token: string;
  lastSeen: Date;
}

export interface NotificationSetting {
  profileId: EntityId;
  key: string;
  value: unknown;
}

export interface Import {
  id: EntityId;
  ownerId: EntityId;
  source: ImportSource;
  idempotencyHash?: string | undefined;
  conflictCount: number;
  status: ImportStatus;
  createdAt: Date;
  completedAt?: Date | undefined;
}

export interface ContactsHash {
  id: EntityId;
  userId: EntityId;
  hash: string;
  saltVersion: number;
  createdAt: Date;
  expiresAt: Date;
}

export interface GoodreadsRow {
  bookId: string;
  title: string;
  author: string;
  additionalAuthors: string[];
  isbn10?: string | undefined;
  isbn13?: string | undefined;
  myRating: number;
  averageRating: number;
  publisher?: string | undefined;
  binding?: string | undefined;
  numberOfPages?: number | undefined;
  yearPublished?: number | undefined;
  originalPublicationYear?: number | undefined;
  dateRead?: Date | undefined;
  dateAdded?: Date | undefined;
  bookshelves: string[];
  exclusiveShelf?: string | undefined;
  myReview?: string | undefined;
  privateNotes?: string | undefined;
  readCount: number;
  status: ReadingStatus;
}

export interface OAuthIdentity {
  provider: string;
  providerUserId: string;
  profileId: EntityId;
}

export interface Session {
  tokenHash: string;
  profileId: EntityId;
  expiresAt: Date;
  revokedAt?: Date | undefined;
}

export interface AccountDeletion {
  profileId: EntityId;
  requestedAt: Date;
  hardDeleteAfter: Date;
  exportedAt?: Date | undefined;
}

export interface PhoneVerification {
  phoneE164: string;
  codeHash: string;
  attempts: number;
  expiresAt: Date;
}

export interface PhoneNumber {
  profileId: EntityId;
  e164Hash: string;
}

export interface ContactIndex {
  profileId: EntityId;
  contactHash: string;
  saltVersion: number;
  expiresAt: Date;
}

export interface EmailIndex {
  profileId: EntityId;
  emailHash: string;
  saltVersion: number;
  expiresAt: Date;
}

export interface HandleHistory {
  id: EntityId;
  profileId: EntityId;
  oldHandle: string;
  retiredAt: Date;
  expiresAt: Date;
}

export interface MagicLinkToken {
  email: string;
  tokenHash: string;
  expiresAt: Date;
  consumedAt?: Date | undefined;
}

export interface Salt {
  id: EntityId;
  version: number;
  keyMaterial: string;
  activeFrom: Date;
  activeTo: Date | undefined;
  createdAt: Date;
}

export type CatalogSource = "open_library" | "google_books";

export interface BookSearchResult {
  source: CatalogSource;
  sourceKey: string;
  title: string;
  subtitle?: string | undefined;
  authors: string[];
  description?: string | undefined;
  coverUrl?: string | undefined;
  firstPublishedYear?: number | undefined;
  publisher?: string | undefined;
  publishedDate?: string | undefined;
  pageCount?: number | undefined;
  isbn10?: string | undefined;
  isbn13?: string | undefined;
  genres?: string[] | undefined;
}
