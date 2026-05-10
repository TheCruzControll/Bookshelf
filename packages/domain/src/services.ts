import { createHash, randomBytes, subtle } from "node:crypto";
import type {
  ActivityRepository,
  AppRepositories,
  AppleJwksProvider,
  AppleTokenClaims,
  AuthIdentityRepository,
  AuthProvider,
  BlockFilter,
  BlockRepository,
  ContactsRepository,
  FollowRepository,
  GoogleJwksProvider,
  GoogleTokenClaims,
  HandleHistoryRepository,
  ImportRepository,
  ListRepository,
  ProfileRepository,
  RankingRepository,
  RecommendationRepository,
  ReviewRepository,
  SessionRepository,
  ShelfRepository
} from "./ports";
import type { ContentType, EntityId, FeedItem, Follow, List, Profile, Ranking, Recommendation, Review, Shelf, ShelfItem, Visibility } from "./types";
import type { ReuploadStrategy } from "./schemas/imports";

export interface SystemShelfDef {
  name: string;
  slug: string;
  visibility: Visibility;
}

export const SYSTEM_SHELVES: SystemShelfDef[] = [
  { name: "Reading", slug: "reading", visibility: "followers" },
  { name: "Want to Read", slug: "want-to-read", visibility: "followers" },
  { name: "Finished", slug: "finished", visibility: "public" },
  { name: "Dropped", slug: "dropped", visibility: "followers" },
];

export const POSTURE_C_DEFAULTS: Record<ContentType, Visibility> = {
  identity: "public",
  follower_list: "public",
  review: "public",
  score: "public",
  finished_shelf: "public",
  custom_shelf: "public",
  want_to_read_shelf: "followers",
  reading_shelf: "followers",
  dropped_shelf: "followers",
  reading_status: "followers",
  activity_stream: "followers",
};

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export class ShelfService {
  constructor(
    private readonly shelves: ShelfRepository,
    private readonly activity: ActivityRepository
  ) {}

  async createShelf(input: {
    ownerId: EntityId;
    name: string;
    visibility: Visibility;
  }): Promise<Shelf> {
    const slug = slugify(input.name);
    return this.shelves.create({
      ownerId: input.ownerId,
      name: input.name,
      slug,
      visibility: input.visibility,
    });
  }

  async updateShelf(input: {
    id: EntityId;
    ownerId: EntityId;
    version: number;
    name?: string | undefined;
    visibility?: Visibility | undefined;
    description?: string | undefined;
  }): Promise<Shelf> {
    const shelf = await this.shelves.findById(input.id);
    if (!shelf) {
      throw Object.assign(new Error("Shelf not found"), { code: "NOT_FOUND" });
    }
    if (shelf.ownerId !== input.ownerId) {
      throw Object.assign(new Error("Forbidden"), { code: "FORBIDDEN" });
    }
    if (shelf.isSystem) {
      throw Object.assign(new Error("Cannot modify system shelf"), { code: "FORBIDDEN" });
    }
    return this.shelves.update(input);
  }

  async deleteShelf(input: {
    id: EntityId;
    ownerId: EntityId;
  }): Promise<void> {
    const shelf = await this.shelves.findById(input.id);
    if (!shelf) {
      throw Object.assign(new Error("Shelf not found"), { code: "NOT_FOUND" });
    }
    if (shelf.ownerId !== input.ownerId) {
      throw Object.assign(new Error("Forbidden"), { code: "FORBIDDEN" });
    }
    if (shelf.isSystem) {
      throw Object.assign(new Error("Cannot delete system shelf"), { code: "FORBIDDEN" });
    }
    await this.shelves.delete(input);
  }

  async listShelves(ownerId: EntityId, viewerId?: EntityId): Promise<Shelf[]> {
    return this.shelves.listShelves(ownerId, viewerId);
  }

  async addBookToShelf(input: {
    ownerId: EntityId;
    shelfId: EntityId;
    bookId: EntityId;
    editionId?: EntityId | undefined;
  }): Promise<ShelfItem> {
    const shelfItem = await this.shelves.addBook(input);

    await this.activity.append({
      actorId: input.ownerId,
      verb: "book_added",
      bookId: input.bookId,
      shelfId: input.shelfId,
      visibility: "followers"
    });

    return shelfItem;
  }
}

export const RESERVED_HANDLES = new Set([
  "admin",
  "administrator",
  "root",
  "superuser",
  "support",
  "help",
  "info",
  "contact",
  "api",
  "www",
  "mail",
  "email",
  "noreply",
  "no-reply",
  "postmaster",
  "webmaster",
  "hostmaster",
  "security",
  "abuse",
  "billing",
  "legal",
  "privacy",
  "terms",
  "team",
  "staff",
  "mod",
  "moderator",
  "official",
  "hone",
  "honeteam",
  "anonymous",
  "system",
  "null",
  "undefined",
  "me",
  "you",
  "user",
  "username",
  "account",
  "profile",
  "settings",
  "notifications",
  "feed",
  "home",
  "discover",
  "search",
  "explore",
]);

const HANDLE_HISTORY_RETENTION_MS = 3 * 365 * 24 * 60 * 60 * 1000;

export class HandleService {
  constructor(
    private readonly profiles: ProfileRepository,
    private readonly handleHistory: HandleHistoryRepository
  ) {}

  isReserved(handle: string): boolean {
    return RESERVED_HANDLES.has(handle.toLowerCase());
  }

  async isAvailable(handle: string): Promise<boolean> {
    if (this.isReserved(handle)) return false;
    const taken = await this.profiles.isHandleTaken(handle.toLowerCase());
    return !taken;
  }

  generateSuggestions(base: string): string[] {
    const lower = base.toLowerCase().replace(/[^a-z0-9_]/g, "");
    const suggestions: string[] = [];
    const suffixes = [
      String(Math.floor(Math.random() * 90 + 10)),
      String(new Date().getFullYear()),
      "_reads",
      "_books",
      "_hone",
    ];
    for (const suffix of suffixes) {
      const candidate = `${lower}${suffix}`;
      if (candidate.length >= 3 && candidate.length <= 30) {
        suggestions.push(candidate);
      }
    }
    return suggestions.slice(0, 3);
  }

  async checkHandle(handle: string): Promise<{ available: boolean; suggestions: string[] }> {
    const available = await this.isAvailable(handle);
    const suggestions = available ? [] : this.generateSuggestions(handle);
    return { available, suggestions };
  }

  async setHandle(userId: EntityId, handle: string): Promise<Profile> {
    const available = await this.isAvailable(handle);
    if (!available) {
      const suggestions = this.generateSuggestions(handle);
      throw Object.assign(new Error("Handle is not available"), {
        code: "HANDLE_TAKEN",
        suggestions,
      });
    }
    const existing = await this.profiles.findById(userId);
    const newHandle = handle.toLowerCase();
    const profile = await this.profiles.setHandle({ userId, handle: newHandle });
    if (existing?.handle && existing.handle !== newHandle) {
      const now = new Date();
      await this.handleHistory.record({
        profileId: userId,
        oldHandle: existing.handle,
        retiredAt: now,
        expiresAt: new Date(now.getTime() + HANDLE_HISTORY_RETENTION_MS),
      });
    }
    return profile;
  }

  async resolveOldHandle(oldHandle: string): Promise<{ currentHandle: string } | null> {
    const entry = await this.handleHistory.findCurrentByOldHandle(oldHandle.toLowerCase());
    if (!entry) return null;
    const profile = await this.profiles.findById(entry.profileId);
    if (!profile) return null;
    return { currentHandle: profile.handle };
  }
}

export class ProfileService {
  constructor(
    private readonly profiles: ProfileRepository,
    private readonly shelves: ShelfRepository
  ) {}

  async createProfile(input: {
    id: EntityId;
    handle: string;
    displayName: string;
    defaultVisibility: Record<ContentType, Visibility>;
  }): Promise<{ profile: Profile; shelves: Shelf[] }> {
    const profile = await this.profiles.create(input);
    const systemShelves = await this.shelves.createSystemShelves(profile.id);
    return { profile, shelves: systemShelves };
  }
}

export class RankingService {
  constructor(private readonly rankings: RankingRepository) {}

  async startBucket(input: {
    ownerId: EntityId;
    bookId: EntityId;
    bucket: number;
  }): Promise<Ranking> {
    return this.rankings.startBucket(input);
  }
}

export class ReviewService {
  constructor(
    private readonly reviews: ReviewRepository,
    private readonly activity: ActivityRepository
  ) {}

  async createReview(input: {
    authorId: EntityId;
    bookId: EntityId;
    editionId?: EntityId | undefined;
    body: string;
    visibility: Visibility;
  }): Promise<Review> {
    const review = await this.reviews.create(input);
    await this.activity.append({
      actorId: input.authorId,
      verb: "book_reviewed",
      bookId: input.bookId,
      reviewId: review.id,
      visibility: input.visibility,
    });
    return review;
  }
}

const APPLE_ISSUER = "https://appleid.apple.com";
const GOOGLE_ISSUER_ACCOUNTS = "https://accounts.google.com";
const GOOGLE_ISSUER_ALT = "accounts.google.com";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function base64UrlDecode(s: string): Uint8Array {
  const rem = s.length % 4;
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + (rem === 0 ? "" : "=".repeat(4 - rem));
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

export class AuthService {
  constructor(
    private readonly authIdentities: AuthIdentityRepository,
    private readonly sessions: SessionRepository,
    private readonly jwksProvider: AppleJwksProvider,
    private readonly appleAudience: string,
    private readonly googleJwksProvider?: GoogleJwksProvider,
    private readonly googleAudience?: string
  ) {}

  async validateAppleToken(identityToken: string, nonce?: string): Promise<AppleTokenClaims> {
    const parts = identityToken.split(".");
    if (parts.length !== 3) {
      throw Object.assign(new Error("Invalid identity token format"), { code: "INVALID_TOKEN" });
    }
    const [headerB64, payloadB64, sigB64] = parts as [string, string, string];

    const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(headerB64))) as { kid?: string; alg?: string };
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64))) as AppleTokenClaims;

    if (payload.iss !== APPLE_ISSUER) {
      throw Object.assign(new Error("Invalid token issuer"), { code: "INVALID_TOKEN" });
    }
    if (payload.aud !== this.appleAudience) {
      throw Object.assign(new Error("Invalid token audience"), { code: "INVALID_TOKEN" });
    }
    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.exp < nowSec) {
      throw Object.assign(new Error("Token expired"), { code: "TOKEN_EXPIRED" });
    }
    if (nonce !== undefined && payload.nonce !== nonce) {
      throw Object.assign(new Error("Nonce mismatch"), { code: "INVALID_TOKEN" });
    }

    const keys = await this.jwksProvider.fetchKeys();
    const jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk) {
      throw Object.assign(new Error("No matching JWKS key found"), { code: "INVALID_TOKEN" });
    }

    const cryptoKey = await subtle.importKey(
      "jwk",
      { kty: jwk.kty, kid: jwk.kid, use: jwk.use, alg: jwk.alg, n: jwk.n, e: jwk.e } as JsonWebKey,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const signingInput = `${headerB64}.${payloadB64}`;
    const signature = base64UrlDecode(sigB64);
    const valid = await subtle.verify(
      "RSASSA-PKCS1-v1_5",
      cryptoKey,
      signature,
      new TextEncoder().encode(signingInput)
    );
    if (!valid) {
      throw Object.assign(new Error("Token signature invalid"), { code: "INVALID_TOKEN" });
    }

    return payload;
  }

  normalizeAppleEmail(claims: AppleTokenClaims): string | undefined {
    const raw = claims.email;
    if (!raw) return undefined;
    if (claims.is_private_email === true || claims.is_private_email === "true") {
      return raw;
    }
    return raw.toLowerCase().trim();
  }

  async appleSignIn(identityToken: string, nonce?: string): Promise<{ sessionToken: string; expiresAt: Date; isNewUser: boolean }> {
    const claims = await this.validateAppleToken(identityToken, nonce);

    const appleUserId = claims.sub;

    const existing = await this.authIdentities.findByProvider({ provider: "apple", providerUserId: appleUserId });

    let profileId: EntityId;
    let isNewUser: boolean;

    if (existing) {
      profileId = existing.profileId;
      isNewUser = false;
    } else {
      const bytes = randomBytes(16);
      bytes[6] = (bytes[6]! & 0x0f) | 0x40;
      bytes[8] = (bytes[8]! & 0x3f) | 0x80;
      const hex = bytes.toString("hex");
      const newProfileId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
      await this.authIdentities.create({
        provider: "apple",
        providerUserId: appleUserId,
        profileId: newProfileId,
      });
      profileId = newProfileId;
      isNewUser = true;
    }

    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken, "utf8").digest("hex");
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await this.sessions.create({ tokenHash, profileId, expiresAt });

    return { sessionToken: rawToken, expiresAt, isNewUser };
  }

  async validateGoogleToken(idToken: string): Promise<GoogleTokenClaims> {
    if (!this.googleJwksProvider) {
      throw Object.assign(new Error("Google JWKS provider not configured"), { code: "INVALID_TOKEN" });
    }
    if (!this.googleAudience) {
      throw Object.assign(new Error("Google audience not configured"), { code: "INVALID_TOKEN" });
    }

    const parts = idToken.split(".");
    if (parts.length !== 3) {
      throw Object.assign(new Error("Invalid id_token format"), { code: "INVALID_TOKEN" });
    }
    const [headerB64, payloadB64, sigB64] = parts as [string, string, string];

    const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(headerB64))) as { kid?: string; alg?: string };
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64))) as GoogleTokenClaims;

    if (payload.iss !== GOOGLE_ISSUER_ACCOUNTS && payload.iss !== GOOGLE_ISSUER_ALT) {
      throw Object.assign(new Error("Invalid token issuer"), { code: "INVALID_TOKEN" });
    }
    if (payload.aud !== this.googleAudience) {
      throw Object.assign(new Error("Invalid token audience"), { code: "INVALID_TOKEN" });
    }
    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.exp < nowSec) {
      throw Object.assign(new Error("Token expired"), { code: "TOKEN_EXPIRED" });
    }

    const keys = await this.googleJwksProvider.fetchKeys();
    const jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk) {
      throw Object.assign(new Error("No matching JWKS key found"), { code: "INVALID_TOKEN" });
    }

    const cryptoKey = await subtle.importKey(
      "jwk",
      { kty: jwk.kty, kid: jwk.kid, use: jwk.use, alg: jwk.alg, n: jwk.n, e: jwk.e } as JsonWebKey,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const signingInput = `${headerB64}.${payloadB64}`;
    const signature = base64UrlDecode(sigB64);
    const valid = await subtle.verify(
      "RSASSA-PKCS1-v1_5",
      cryptoKey,
      signature,
      new TextEncoder().encode(signingInput)
    );
    if (!valid) {
      throw Object.assign(new Error("Token signature invalid"), { code: "INVALID_TOKEN" });
    }

    return payload;
  }

  async googleSignIn(idToken: string): Promise<{ sessionToken: string; expiresAt: Date; isNewUser: boolean }> {
    const claims = await this.validateGoogleToken(idToken);

    const googleUserId = claims.sub;

    const existing = await this.authIdentities.findByProvider({ provider: "google", providerUserId: googleUserId });

    let profileId: EntityId;
    let isNewUser: boolean;

    if (existing) {
      profileId = existing.profileId;
      isNewUser = false;
    } else {
      const bytes = randomBytes(16);
      bytes[6] = (bytes[6]! & 0x0f) | 0x40;
      bytes[8] = (bytes[8]! & 0x3f) | 0x80;
      const hex = bytes.toString("hex");
      const newProfileId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
      await this.authIdentities.create({
        provider: "google",
        providerUserId: googleUserId,
        profileId: newProfileId,
      });
      profileId = newProfileId;
      isNewUser = true;
    }

    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken, "utf8").digest("hex");
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await this.sessions.create({ tokenHash, profileId, expiresAt });

    return { sessionToken: rawToken, expiresAt, isNewUser };
  }
}

export class BlockService implements BlockFilter {
  constructor(private readonly blocks: BlockRepository) {}

  private async blockedIds(viewerId: EntityId): Promise<Set<EntityId>> {
    const [outgoing, incoming] = await Promise.all([
      this.blocks.listBlockedByUser(viewerId),
      this.blocks.listBlockingUser(viewerId),
    ]);
    const ids = new Set<EntityId>();
    for (const b of outgoing) ids.add(b.blockedId);
    for (const b of incoming) ids.add(b.blockerId);
    return ids;
  }

  async removeBlocked<T extends { id: EntityId }>(viewerId: EntityId, items: T[]): Promise<T[]> {
    if (items.length === 0) return items;
    const ids = await this.blockedIds(viewerId);
    return items.filter((item) => !ids.has(item.id));
  }

  async removeBlockedIds(viewerId: EntityId, userIds: EntityId[]): Promise<EntityId[]> {
    if (userIds.length === 0) return userIds;
    const ids = await this.blockedIds(viewerId);
    return userIds.filter((id) => !ids.has(id));
  }

  async removeBlockedFeedItems(viewerId: EntityId, items: FeedItem[]): Promise<FeedItem[]> {
    if (items.length === 0) return items;
    const ids = await this.blockedIds(viewerId);
    return items.filter((item) => !ids.has(item.event.actorId));
  }

  async removeBlockedFollows(viewerId: EntityId, follows: Follow[], userIdFn: (f: Follow) => EntityId): Promise<Follow[]> {
    if (follows.length === 0) return follows;
    const ids = await this.blockedIds(viewerId);
    return follows.filter((f) => !ids.has(userIdFn(f)));
  }

  async removeBlockedLists(viewerId: EntityId, lists: List[]): Promise<List[]> {
    if (lists.length === 0) return lists;
    const ids = await this.blockedIds(viewerId);
    return lists.filter((l) => !ids.has(l.ownerId));
  }

  async removeBlockedRecommendations(viewerId: EntityId, recs: Recommendation[], sourceUserIdFn: (r: Recommendation) => EntityId | undefined): Promise<Recommendation[]> {
    if (recs.length === 0) return recs;
    const ids = await this.blockedIds(viewerId);
    return recs.filter((r) => {
      const userId = sourceUserIdFn(r);
      return userId === undefined || !ids.has(userId);
    });
  }
}

export class FollowService {
  private readonly blockService: BlockService;

  constructor(
    private readonly follows: FollowRepository,
    private readonly blocks: BlockRepository
  ) {
    this.blockService = new BlockService(blocks);
  }

  async createFollow(input: { followerId: EntityId; followeeId: EntityId }): Promise<Follow> {
    if (input.followerId === input.followeeId) {
      throw Object.assign(new Error("Cannot follow yourself"), { code: "BAD_REQUEST" });
    }

    // Block check: either direction blocks the follow
    const [blockedByTarget, blockedTarget] = await Promise.all([
      this.blocks.findBlock({ blockerId: input.followeeId, blockedId: input.followerId }),
      this.blocks.findBlock({ blockerId: input.followerId, blockedId: input.followeeId }),
    ]);
    if (blockedByTarget || blockedTarget) {
      throw Object.assign(new Error("Cannot follow this user"), { code: "FORBIDDEN" });
    }

    // Idempotent: if already following, return existing
    const existing = await this.follows.findFollow(input);
    if (existing) {
      return existing;
    }

    return this.follows.follow(input);
  }

  async deleteFollow(input: { followerId: EntityId; followeeId: EntityId }): Promise<void> {
    // Idempotent: if not following, succeed silently
    const existing = await this.follows.findFollow(input);
    if (!existing) {
      return;
    }
    await this.follows.unfollow(input);
  }

  async listFollowers(userId: EntityId, viewerId: EntityId, _limit: number): Promise<Follow[]> {
    const all = await this.follows.listFollowers(userId, viewerId);
    return this.blockService.removeBlockedFollows(viewerId, all, (f) => f.followerId);
  }

  async listFollowing(userId: EntityId, viewerId: EntityId, _limit: number): Promise<Follow[]> {
    const all = await this.follows.listFollowing(userId, viewerId);
    return this.blockService.removeBlockedFollows(viewerId, all, (f) => f.followeeId);
  }
}

export class SocialService {
  private readonly blockService: BlockService;

  constructor(
    private readonly follows: FollowRepository,
    private readonly blocks: BlockRepository,
    private readonly contacts: ContactsRepository,
    private readonly recommendations: RecommendationRepository,
    private readonly activity: ActivityRepository,
    private readonly profiles: ProfileRepository,
    private readonly lists: ListRepository,
  ) {
    this.blockService = new BlockService(blocks);
  }

  async listFollowers(userId: EntityId, viewerId: EntityId): Promise<Follow[]> {
    const all = await this.follows.listFollowers(userId, viewerId);
    return this.blockService.removeBlockedFollows(viewerId, all, (f) => f.followerId);
  }

  async listFollowing(userId: EntityId, viewerId: EntityId): Promise<Follow[]> {
    const all = await this.follows.listFollowing(userId, viewerId);
    return this.blockService.removeBlockedFollows(viewerId, all, (f) => f.followeeId);
  }

  async findContactMatches(input: { hashes: string[]; viewerId: EntityId }): Promise<EntityId[]> {
    const matches = await this.contacts.findMatches({ hashes: input.hashes, excludeUserId: input.viewerId });
    return this.blockService.removeBlockedIds(input.viewerId, matches);
  }

  async getFriendFeed(input: { viewerId: EntityId; cursor?: string; limit: number }): Promise<FeedItem[]> {
    const items = await this.activity.getFriendFeed(input);
    return this.blockService.removeBlockedFeedItems(input.viewerId, items);
  }

  async getRecommendations(userId: EntityId, limit: number): Promise<Recommendation[]> {
    const recs = await this.recommendations.getForUser(userId, limit);
    return this.blockService.removeBlockedRecommendations(userId, recs, () => undefined);
  }

  async searchProfiles(handle: string, viewerId: EntityId): Promise<Profile | null> {
    const profile = await this.profiles.findByHandle(handle);
    if (!profile) return null;
    const filtered = await this.blockService.removeBlocked(viewerId, [profile]);
    return filtered[0] ?? null;
  }

  async discoverLists(ownerId: EntityId, viewerId: EntityId): Promise<List[]> {
    const all = await this.lists.listByOwner(ownerId, viewerId);
    return this.blockService.removeBlockedLists(viewerId, all);
  }
}

export const REUPLOAD_OPTIONS: ReuploadStrategy[] = [
  "process_from_scratch",
  "merge_changes_only",
  "cancel",
];

export class ImportService {
  constructor(private readonly imports: ImportRepository) {}

  async checkForDuplicate(input: {
    ownerId: EntityId;
    fileHash: string;
  }): Promise<{
    isDuplicate: boolean;
    existingImportId?: EntityId;
    options?: ReuploadStrategy[];
  }> {
    const existing = await this.imports.findByOwnerAndHash({
      ownerId: input.ownerId,
      hash: input.fileHash,
    });

    if (!existing) {
      return { isDuplicate: false };
    }

    return {
      isDuplicate: true,
      existingImportId: existing.id,
      options: REUPLOAD_OPTIONS,
    };
  }

  async confirmReupload(input: {
    ownerId: EntityId;
    fileHash: string;
    strategy: ReuploadStrategy;
  }): Promise<{ importId?: EntityId; status: "created" | "cancelled" }> {
    if (input.strategy === "cancel") {
      return { status: "cancelled" };
    }

    const id = crypto.randomUUID();
    const importRecord = await this.imports.create({
      id,
      ownerId: input.ownerId,
      source: "goodreads",
      idempotencyHash: input.fileHash,
    });

    if (input.strategy === "merge_changes_only") {
      await this.imports.updateStatus({
        id: importRecord.id,
        status: "processing",
      });
    }

    return { importId: importRecord.id, status: "created" };
  }
}

export class AppServices {
  readonly shelves: ShelfService;
  readonly handles: HandleService;
  readonly profiles: ProfileService;
  readonly rankings: RankingService;
  readonly reviews: ReviewService;
  readonly blocks: BlockService;
  readonly social: SocialService;

  readonly follows: FollowService;

  readonly imports: ImportService;

  constructor(
    readonly repositories: AppRepositories,
    readonly auth: AuthProvider
  ) {
    this.shelves = new ShelfService(
      repositories.shelves,
      repositories.activity
    );
    this.handles = new HandleService(repositories.profiles, repositories.handleHistory);
    this.profiles = new ProfileService(
      repositories.profiles,
      repositories.shelves
    );
    this.rankings = new RankingService(repositories.rankings);
    this.reviews = new ReviewService(
      repositories.reviews,
      repositories.activity
    );
    this.blocks = new BlockService(repositories.blocks);
    this.follows = new FollowService(
      repositories.follows,
      repositories.blocks
    );
    this.social = new SocialService(
      repositories.follows,
      repositories.blocks,
      repositories.contacts,
      repositories.recommendations,
      repositories.activity,
      repositories.profiles,
      repositories.lists,
    );
    this.imports = new ImportService(repositories.imports);
  }
}
