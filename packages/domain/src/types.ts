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

export type ActivityVerb =
  | "book_added"
  | "book_started"
  | "book_finished"
  | "book_dropped"
  | "book_ranked"
  | "book_reviewed"
  | "shelf_updated";

export interface Profile {
  id: EntityId;
  handle: string;
  displayName: string;
  bio?: string | undefined;
  avatarUrl?: string | undefined;
  defaultVisibility: Visibility;
  defaultContentVisibility?: Partial<Record<ContentType, Visibility>> | undefined;
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
