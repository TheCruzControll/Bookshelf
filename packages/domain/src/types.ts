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

export type BlockDirection = "outgoing" | "incoming";

export interface Profile {
  id: EntityId;
  handle: string;
  displayName: string;
  bio?: string | undefined;
  avatarUrl?: string | undefined;
  defaultVisibility: Visibility;
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

export interface Ranking {
  id: EntityId;
  ownerId: EntityId;
  bookId: EntityId;
  rank: number;
  score: number;
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
  id: EntityId;
  userId: EntityId;
  platform: NotificationPlatform;
  token: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Import {
  id: EntityId;
  ownerId: EntityId;
  source: ImportSource;
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

export interface Session {
  id: EntityId;
  userId: EntityId;
  createdAt: Date;
  expiresAt: Date;
}
