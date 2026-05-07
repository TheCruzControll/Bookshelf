import type {
  ActivityEvent,
  Book,
  Edition,
  EntityId,
  FeedItem,
  Profile,
  Recommendation,
  Review,
  Shelf,
  ShelfItem,
  Visibility
} from "./types";

export interface AuthIdentity {
  userId: EntityId;
  email?: string;
}

export interface AuthProvider {
  getCurrentIdentity(): Promise<AuthIdentity | null>;
}

export interface StorageProvider {
  getPublicUrl(path: string): string;
  putObject(input: {
    bucket: string;
    path: string;
    body: ArrayBuffer;
    contentType: string;
  }): Promise<{ path: string }>;
}

export interface ProfileRepository {
  findById(id: EntityId): Promise<Profile | null>;
  findByHandle(handle: string): Promise<Profile | null>;
  create(input: {
    id: EntityId;
    handle: string;
    displayName: string;
    defaultVisibility: Visibility;
  }): Promise<Profile>;
}

export interface BookRepository {
  findBookById(id: EntityId): Promise<Book | null>;
  findEditionByIsbn(isbn: string): Promise<Edition | null>;
  search(query: string, limit: number): Promise<Book[]>;
}

export interface ShelfRepository {
  listShelves(ownerId: EntityId, viewerId?: EntityId): Promise<Shelf[]>;
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
}

export interface ReviewRepository {
  create(input: {
    authorId: EntityId;
    bookId: EntityId;
    editionId?: EntityId | undefined;
    body: string;
    visibility: Visibility;
  }): Promise<Review>;
}

export interface ActivityRepository {
  append(event: Omit<ActivityEvent, "id" | "occurredAt">): Promise<ActivityEvent>;
  getFriendFeed(input: {
    viewerId: EntityId;
    cursor?: string;
    limit: number;
  }): Promise<FeedItem[]>;
}

export interface RecommendationRepository {
  getForUser(userId: EntityId, limit: number): Promise<Recommendation[]>;
}

export interface AppRepositories {
  profiles: ProfileRepository;
  books: BookRepository;
  shelves: ShelfRepository;
  reviews: ReviewRepository;
  activity: ActivityRepository;
  recommendations: RecommendationRepository;
}
