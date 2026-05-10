import type {
  ActivityEvent,
  Block,
  Book,
  ContactsHash,
  Edition,
  EntityId,
  Follow,
  HandleHistory,
  Import,
  ImportSource,
  ImportStatus,
  List,
  ListItem,
  NotificationPlatform,
  NotificationSetting,
  NotificationToken,
  Ranking,
  FeedItem,
  Profile,
  Recommendation,
  Review,
  OAuthIdentity,
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
}

export interface ReviewRepository {
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
  authIdentities: AuthIdentityRepository;
  sessions: SessionRepository;
  handleHistory: HandleHistoryRepository;
}

export interface BlockFilter {
  removeBlocked<T extends { id: EntityId }>(viewerId: EntityId, items: T[]): Promise<T[]>;
}
