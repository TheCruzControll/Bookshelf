import type {
  ActivityEvent,
  Block,
  Book,
  ContactsHash,
  Edition,
  EntityId,
  Follow,
  Import,
  ImportSource,
  ImportStatus,
  List,
  ListItem,
  NotificationPlatform,
  NotificationToken,
  Ranking,
  FeedItem,
  Profile,
  Recommendation,
  Review,
  Session,
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
  isHandleTaken(handle: string): Promise<boolean>;
  setHandle(input: { userId: EntityId; handle: string }): Promise<Profile>;
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
  createSystemShelves(ownerId: EntityId): Promise<Shelf[]>;
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

export interface FollowRepository {
  follow(input: { followerId: EntityId; followeeId: EntityId }): Promise<Follow>;
  unfollow(input: { followerId: EntityId; followeeId: EntityId }): Promise<void>;
  findFollow(input: { followerId: EntityId; followeeId: EntityId }): Promise<Follow | null>;
  listFollowers(userId: EntityId, viewerId?: EntityId): Promise<Follow[]>;
  listFollowing(userId: EntityId, viewerId?: EntityId): Promise<Follow[]>;
  isMutual(input: { userA: EntityId; userB: EntityId }): Promise<boolean>;
}

export interface BlockRepository {
  block(input: { blockerId: EntityId; blockedId: EntityId }): Promise<Block>;
  unblock(input: { blockerId: EntityId; blockedId: EntityId }): Promise<void>;
  findBlock(input: { blockerId: EntityId; blockedId: EntityId }): Promise<Block | null>;
  listBlockedByUser(blockerId: EntityId): Promise<Block[]>;
  isBlocked(input: { viewerId: EntityId; targetId: EntityId }): Promise<boolean>;
}

export interface RankingRepository {
  upsert(input: {
    ownerId: EntityId;
    bookId: EntityId;
    rank: number;
    score: number;
  }): Promise<Ranking>;
  findByOwnerAndBook(input: { ownerId: EntityId; bookId: EntityId }): Promise<Ranking | null>;
  listByOwner(ownerId: EntityId, viewerId?: EntityId): Promise<Ranking[]>;
  delete(input: { ownerId: EntityId; bookId: EntityId }): Promise<void>;
}

export interface NotificationRepository {
  registerToken(input: {
    profileId: EntityId;
    platform: NotificationPlatform;
    token: string;
  }): Promise<NotificationToken>;
  removeToken(input: { profileId: EntityId; token: string }): Promise<void>;
  listTokensForUser(profileId: EntityId): Promise<NotificationToken[]>;
}

export interface ImportRepository {
  create(input: {
    id: EntityId;
    ownerId: EntityId;
    source: ImportSource;
  }): Promise<Import>;
  findById(id: EntityId): Promise<Import | null>;
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
  deleteForUser(userId: EntityId): Promise<void>;
  deleteExpired(): Promise<void>;
  listByUser(userId: EntityId): Promise<ContactsHash[]>;
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

export interface SessionRepository {
  create(input: {
    id: EntityId;
    userId: EntityId;
    expiresAt: Date;
  }): Promise<Session>;
  findById(id: EntityId): Promise<Session | null>;
  deleteById(id: EntityId): Promise<void>;
  deleteAllForUser(userId: EntityId): Promise<void>;
}

export interface AppRepositories {
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
  lists: ListRepository;
  sessions: SessionRepository;
}
