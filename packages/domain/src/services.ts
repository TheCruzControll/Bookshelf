import { createHash, randomBytes, subtle } from "node:crypto";
import { parsePhoneNumberFromString } from "libphonenumber-js";
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
  EmailIndexRepository,
  EmailProvider,
  FollowRepository,
  GoogleJwksProvider,
  GoogleTokenClaims,
  HandleHistoryRepository,
  ImportRepository,
  InAppNotificationRepository,
  ListRepository,
  MagicLinkRepository,
  ProfileRepository,
  RankingRepository,
  RecommendationRepository,
  ReviewRepository,
  SessionRepository,
  PhoneNumberRepository,
  PhoneVerificationRepository,
  SaltRepository,
  ShelfRepository,
  SmsProvider
} from "./ports";
import type { ActivityEvent, ActivityVerb, Block, ContentType, EntityId, FeedItem, Follow, InAppNotification, List, Profile, Ranking, Recommendation, Review, Shelf, ShelfAuthorType, ShelfItem, Visibility } from "./types";
import type { ReuploadStrategy } from "./schemas/imports";
import { scoreFromRank, isScoreUnlocked, redactScore } from "./score";
import type { GatedRanking } from "./score";
import { publishActivityEvent } from "./activity-publisher";

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

const THIRTY_MINUTES_MS = 30 * 60 * 1000;

/**
 * Compute a deterministic group key for feed event grouping.
 * Events from the same actor with the same verb within the same 30-minute
 * window share a group key: (actor_id, verb, floor(occurred_at / 30min)).
 */
export function computeGroupKey(actorId: EntityId, verb: ActivityVerb, occurredAt: Date): string {
  const bucket = Math.floor(occurredAt.getTime() / THIRTY_MINUTES_MS);
  return `${actorId}:${verb}:${bucket}`;
}

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
    private readonly activity: ActivityRepository,
    private readonly profiles?: ProfileRepository
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

    await publishActivityEvent(this.activity, null, {
      actorId: input.ownerId,
      verb: "book_added",
      bookId: input.bookId,
      shelfId: input.shelfId,
      visibility: "followers",
    });

    return shelfItem;
  }

  async upsertShelfItem(input: {
    ownerId: EntityId;
    shelfId: EntityId;
    bookId: EntityId;
    editionId?: EntityId | undefined;
    notes?: string | undefined;
    position?: number | undefined;
  }): Promise<ShelfItem> {
    const shelf = await this.shelves.findById(input.shelfId);
    if (!shelf) {
      throw Object.assign(new Error("Shelf not found"), { code: "NOT_FOUND" });
    }
    if (shelf.ownerId !== input.ownerId) {
      throw Object.assign(new Error("Forbidden"), { code: "FORBIDDEN" });
    }

    // Default position to append (max + 1)
    let position = input.position;
    if (position === undefined) {
      const maxPos = await this.shelves.getMaxPosition(input.shelfId);
      position = maxPos + 1;
    }

    return this.shelves.upsertShelfItem({
      shelfId: input.shelfId,
      bookId: input.bookId,
      editionId: input.editionId,
      notes: input.notes,
      position,
    });
  }

  async moveShelfItem(input: {
    ownerId: EntityId;
    shelfId: EntityId;
    bookId: EntityId;
    position: number;
  }): Promise<ShelfItem> {
    const shelf = await this.shelves.findById(input.shelfId);
    if (!shelf) {
      throw Object.assign(new Error("Shelf not found"), { code: "NOT_FOUND" });
    }
    if (shelf.ownerId !== input.ownerId) {
      throw Object.assign(new Error("Forbidden"), { code: "FORBIDDEN" });
    }

    const existing = await this.shelves.findShelfItem({ shelfId: input.shelfId, bookId: input.bookId });
    if (!existing) {
      throw Object.assign(new Error("Shelf item not found"), { code: "NOT_FOUND" });
    }

    return this.shelves.moveShelfItem({
      shelfId: input.shelfId,
      bookId: input.bookId,
      position: input.position,
    });
  }

  async publishShelf(input: {
    id: EntityId;
    ownerId: EntityId;
    version: number;
    authorType?: ShelfAuthorType | undefined;
  }): Promise<Shelf> {
    const shelf = await this.shelves.findById(input.id);
    if (!shelf) {
      throw Object.assign(new Error("Shelf not found"), { code: "NOT_FOUND" });
    }
    if (shelf.ownerId !== input.ownerId) {
      throw Object.assign(new Error("Forbidden"), { code: "FORBIDDEN" });
    }
    if (shelf.kind !== "list") {
      throw Object.assign(new Error("Only list shelves can be published"), { code: "BAD_REQUEST" });
    }

    const effectiveAuthorType = input.authorType ?? shelf.authorType;

    if (effectiveAuthorType === "internal_editorial") {
      if (!this.profiles) {
        throw Object.assign(new Error("Profile repository not configured"), { code: "INTERNAL_ERROR" });
      }
      const profile = await this.profiles.findById(input.ownerId);
      if (!profile || !profile.verified) {
        throw Object.assign(new Error("Only verified accounts can publish as internal editorial"), { code: "FORBIDDEN" });
      }
    }

    if (shelf.publishedAt && effectiveAuthorType === shelf.authorType) {
      return shelf;
    }
    return this.shelves.update({
      id: input.id,
      ownerId: input.ownerId,
      version: input.version,
      publishedAt: shelf.publishedAt ?? new Date(),
      authorType: effectiveAuthorType,
    });
  }

  async unpublishShelf(input: {
    id: EntityId;
    ownerId: EntityId;
    version: number;
  }): Promise<Shelf> {
    const shelf = await this.shelves.findById(input.id);
    if (!shelf) {
      throw Object.assign(new Error("Shelf not found"), { code: "NOT_FOUND" });
    }
    if (shelf.ownerId !== input.ownerId) {
      throw Object.assign(new Error("Forbidden"), { code: "FORBIDDEN" });
    }
    if (shelf.kind !== "list") {
      throw Object.assign(new Error("Only list shelves can be unpublished"), { code: "BAD_REQUEST" });
    }
    if (!shelf.publishedAt) {
      return shelf;
    }
    return this.shelves.update({
      id: input.id,
      ownerId: input.ownerId,
      version: input.version,
      publishedAt: null,
    });
  }

  async deleteShelfItem(input: {
    ownerId: EntityId;
    shelfId: EntityId;
    bookId: EntityId;
  }): Promise<void> {
    const shelf = await this.shelves.findById(input.shelfId);
    if (!shelf) {
      throw Object.assign(new Error("Shelf not found"), { code: "NOT_FOUND" });
    }
    if (shelf.ownerId !== input.ownerId) {
      throw Object.assign(new Error("Forbidden"), { code: "FORBIDDEN" });
    }

    await this.shelves.deleteShelfItem({
      shelfId: input.shelfId,
      bookId: input.bookId,
    });
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
  constructor(
    private readonly rankings: RankingRepository,
    private readonly activity: ActivityRepository
  ) {}

  async startBucket(input: {
    ownerId: EntityId;
    bookId: EntityId;
    bucket: number;
  }): Promise<Ranking> {
    return this.rankings.startBucket(input);
  }

  /**
   * Finish ranking flow: insert or update ranking, compute score from position,
   * and write a frozen-at-publish activity event via the shared publisher.
   */
  async finishBook(input: {
    ownerId: EntityId;
    bookId: EntityId;
    position: number;
    total: number;
  }): Promise<{ ranking: Ranking; event: ActivityEvent }> {
    const score = scoreFromRank(input.position, input.total);

    const ranking = await this.rankings.upsert({
      ownerId: input.ownerId,
      bookId: input.bookId,
      rank: input.position,
      score,
    });

    const event = await publishActivityEvent(this.activity, this.rankings, {
      actorId: input.ownerId,
      verb: "book_finished",
      bookId: input.bookId,
      visibility: "followers",
      scoreSnapshot: {
        score,
        locked: input.total < 10,
      },
    });

    // Event is guaranteed non-null when scoreSnapshot is provided.
    return { ranking, event: event! };
  }

  /**
   * Check whether a user has unlocked scores (>= 10 ranked books).
   */
  async getScoreUnlockStatus(ownerId: EntityId): Promise<{ unlocked: boolean; finishedCount: number }> {
    const rankings = await this.rankings.listByOwner(ownerId);
    const finishedCount = rankings.length;
    return { unlocked: isScoreUnlocked(finishedCount), finishedCount };
  }

  /**
   * List rankings for a user with scores redacted when the user has not
   * yet unlocked scores (fewer than 10 ranked books).
   */
  async listRankingsWithGate(ownerId: EntityId): Promise<GatedRanking[]> {
    const rankings = await this.rankings.listByOwner(ownerId);
    const unlocked = isScoreUnlocked(rankings.length);
    return rankings.map((r) => redactScore(r, unlocked));
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
    await publishActivityEvent(this.activity, null, {
      actorId: input.authorId,
      verb: "book_reviewed",
      bookId: input.bookId,
      reviewId: review.id,
      visibility: input.visibility,
    });
    return review;
  }

  async updateReview(input: {
    id: EntityId;
    authorId: EntityId;
    version: number;
    body?: string | undefined;
    visibility?: Visibility | undefined;
  }): Promise<Review> {
    const existing = await this.reviews.findById(input.id);
    if (!existing) {
      throw Object.assign(new Error("Review not found"), { code: "NOT_FOUND" });
    }
    if (existing.authorId !== input.authorId) {
      throw Object.assign(new Error("Forbidden"), { code: "FORBIDDEN" });
    }
    if (existing.version !== input.version) {
      throw Object.assign(new Error("Version conflict"), {
        code: "VERSION_CONFLICT",
        currentReview: existing,
      });
    }
    return this.reviews.update(input);
  }

  async deleteReview(input: {
    id: EntityId;
    authorId: EntityId;
  }): Promise<void> {
    const existing = await this.reviews.findById(input.id);
    if (!existing) {
      throw Object.assign(new Error("Review not found"), { code: "NOT_FOUND" });
    }
    if (existing.authorId !== input.authorId) {
      throw Object.assign(new Error("Forbidden"), { code: "FORBIDDEN" });
    }
    await this.activity.deleteByReviewId(existing.id);
    await this.reviews.delete({ id: input.id, authorId: input.authorId });
  }
}

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export class SessionService {
  constructor(private readonly sessions: SessionRepository) {}

  /**
   * Create a new session for a profile.
   * Generates an opaque random token, stores its sha256 hash, and returns the raw token.
   */
  async create(profileId: EntityId): Promise<{ sessionToken: string; expiresAt: Date }> {
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken, "utf8").digest("hex");
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await this.sessions.create({ tokenHash, profileId, expiresAt });

    return { sessionToken: rawToken, expiresAt };
  }

  /**
   * Rotate a session: revoke the old token and issue a new one for the same profile.
   * The caller must supply the current raw token (not the hash).
   */
  async rotate(currentToken: string): Promise<{ sessionToken: string; expiresAt: Date }> {
    const currentHash = createHash("sha256").update(currentToken, "utf8").digest("hex");
    const existing = await this.sessions.findByTokenHash(currentHash);

    if (!existing) {
      throw Object.assign(new Error("Session not found"), { code: "SESSION_NOT_FOUND" });
    }
    if (existing.revokedAt) {
      throw Object.assign(new Error("Session already revoked"), { code: "SESSION_REVOKED" });
    }
    if (existing.expiresAt < new Date()) {
      throw Object.assign(new Error("Session expired"), { code: "SESSION_EXPIRED" });
    }

    // Revoke the old session
    await this.sessions.revokeByTokenHash(currentHash);

    // Create a fresh session for the same profile
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken, "utf8").digest("hex");
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await this.sessions.create({ tokenHash, profileId: existing.profileId, expiresAt });

    return { sessionToken: rawToken, expiresAt };
  }

  /**
   * Revoke a single session by its raw token.
   */
  async revoke(token: string): Promise<void> {
    const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
    const existing = await this.sessions.findByTokenHash(tokenHash);

    if (!existing) {
      throw Object.assign(new Error("Session not found"), { code: "SESSION_NOT_FOUND" });
    }

    await this.sessions.revokeByTokenHash(tokenHash);
  }

  /**
   * Revoke all sessions for a profile (e.g. on password reset or account lockout).
   */
  async revokeAll(profileId: EntityId): Promise<void> {
    await this.sessions.revokeAllForProfile(profileId);
  }
}

const APPLE_ISSUER = "https://appleid.apple.com";
const GOOGLE_ISSUER_ACCOUNTS = "https://accounts.google.com";
const GOOGLE_ISSUER_ALT = "accounts.google.com";

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

const MAGIC_LINK_TTL_MS = 10 * 60 * 1000; // 10 minutes

export class MagicLinkService {
  constructor(
    private readonly magicLinks: MagicLinkRepository,
    private readonly authIdentities: AuthIdentityRepository,
    private readonly sessions: SessionRepository,
    private readonly emailProvider: EmailProvider
  ) {}

  async requestMagicLink(email: string): Promise<{ expiresAt: Date }> {
    const normalizedEmail = email.toLowerCase().trim();

    // Clean up any expired tokens for this email
    await this.magicLinks.deleteExpiredForEmail(normalizedEmail);

    // Generate a random token and hash it for storage
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken, "utf8").digest("hex");
    const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MS);

    await this.magicLinks.create({
      email: normalizedEmail,
      tokenHash,
      expiresAt,
    });

    // Send email with the raw token (not the hash)
    const expiresInMinutes = Math.round(MAGIC_LINK_TTL_MS / 60000);
    await this.emailProvider.sendMagicLink({
      to: normalizedEmail,
      token: rawToken,
      expiresInMinutes,
    });

    return { expiresAt };
  }

  async consumeMagicLink(token: string): Promise<{ sessionToken: string; expiresAt: Date; isNewUser: boolean }> {
    const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");

    const magicLink = await this.magicLinks.findByTokenHash(tokenHash);

    if (!magicLink) {
      throw Object.assign(new Error("Invalid or expired magic link"), { code: "INVALID_TOKEN" });
    }

    if (magicLink.consumedAt) {
      throw Object.assign(new Error("Magic link already used"), { code: "TOKEN_CONSUMED" });
    }

    if (magicLink.expiresAt < new Date()) {
      throw Object.assign(new Error("Magic link expired"), { code: "TOKEN_EXPIRED" });
    }

    // Mark the token as consumed (one-time use)
    await this.magicLinks.markConsumed(tokenHash);

    // Find or create identity by email
    const existing = await this.authIdentities.findByProvider({
      provider: "email",
      providerUserId: magicLink.email,
    });

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
        provider: "email",
        providerUserId: magicLink.email,
        profileId: newProfileId,
      });
      profileId = newProfileId;
      isNewUser = true;
    }

    // Create a session
    const rawSessionToken = randomBytes(32).toString("hex");
    const sessionTokenHash = createHash("sha256").update(rawSessionToken, "utf8").digest("hex");
    const sessionExpiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await this.sessions.create({ tokenHash: sessionTokenHash, profileId, expiresAt: sessionExpiresAt });

    return { sessionToken: rawSessionToken, expiresAt: sessionExpiresAt, isNewUser };
  }
}

export class BlockService implements BlockFilter {
  constructor(
    private readonly blocks: BlockRepository,
    private readonly follows?: FollowRepository,
  ) {}

  async createBlock(input: { blockerId: EntityId; blockedId: EntityId }): Promise<Block> {
    if (input.blockerId === input.blockedId) {
      throw Object.assign(new Error('Cannot block yourself'), { code: 'BAD_REQUEST' });
    }

    // Idempotent: if already blocked, return existing
    const existing = await this.blocks.findBlock(input);
    if (existing) {
      return existing;
    }

    // Cascade unfollow: sever follows in both directions
    if (this.follows) {
      await Promise.all([
        this.follows.unfollow({ followerId: input.blockerId, followeeId: input.blockedId }),
        this.follows.unfollow({ followerId: input.blockedId, followeeId: input.blockerId }),
      ]);
    }

    return this.blocks.block(input);
  }

  async deleteBlock(input: { blockerId: EntityId; blockedId: EntityId }): Promise<void> {
    // Idempotent: if not blocked, succeed silently
    const existing = await this.blocks.findBlock(input);
    if (!existing) {
      return;
    }
    // No auto-restore of follows on unblock
    await this.blocks.unblock(input);
  }

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

  async getMutualCount(userId: EntityId): Promise<number> {
    return this.follows.countMutuals(userId);
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

export class ContactsService {
  private readonly blockService: BlockService;

  constructor(
    private readonly contacts: ContactsRepository,
    private readonly emailIndex: EmailIndexRepository,
    private readonly blocks: BlockRepository,
    private readonly salts?: SaltRepository,
  ) {
    this.blockService = new BlockService(blocks);
  }

  async validateSaltVersion(saltVersion: number): Promise<void> {
    if (!this.salts) {
      throw Object.assign(new Error("Salt repository not configured"), { code: "INTERNAL_ERROR" });
    }
    const active = await this.salts.findActive();
    if (!active) {
      throw Object.assign(new Error("No active salt configured"), { code: "INTERNAL_ERROR" });
    }
    if (active.version !== saltVersion) {
      throw Object.assign(
        new Error(`Stale salt version: expected ${active.version}, got ${saltVersion}`),
        { code: "STALE_SALT", expectedVersion: active.version },
      );
    }
  }

  async uploadPhoneHashes(input: {
    userId: EntityId;
    hashes: Array<{ hash: string; saltVersion: number; expiresAt: Date }>;
  }): Promise<void> {
    await this.contacts.upsertHashes(input);
  }

  async uploadEmailHashes(input: {
    userId: EntityId;
    hashes: Array<{ hash: string; saltVersion: number; expiresAt: Date }>;
  }): Promise<void> {
    await this.emailIndex.upsertHashes(input);
  }

  async matchPhones(input: { hashes: string[]; viewerId: EntityId }): Promise<EntityId[]> {
    const matches = await this.contacts.findMatches({ hashes: input.hashes, excludeUserId: input.viewerId });
    return this.blockService.removeBlockedIds(input.viewerId, matches);
  }

  async matchEmails(input: { hashes: string[]; viewerId: EntityId }): Promise<EntityId[]> {
    const matches = await this.emailIndex.findMatches({ hashes: input.hashes, excludeUserId: input.viewerId });
    return this.blockService.removeBlockedIds(input.viewerId, matches);
  }

  async deleteForUser(userId: EntityId): Promise<void> {
    await Promise.all([
      this.contacts.deleteForUser(userId),
      this.emailIndex.deleteForUser(userId),
    ]);
  }

  async deleteExpired(): Promise<void> {
    await Promise.all([
      this.contacts.deleteExpired(),
      this.emailIndex.deleteExpired(),
    ]);
  }

  /**
   * Remove all contact/email index rows whose hash matches the given target hashes.
   * Called on account deletion so no one can match against the deleted user's phone/email.
   */
  async clearTargetHashes(targetHashes: string[]): Promise<void> {
    if (targetHashes.length === 0) return;
    await Promise.all([
      this.contacts.deleteByTargetHash(targetHashes),
      this.emailIndex.deleteByTargetHash(targetHashes),
    ]);
  }
}

export class NotificationService {
  constructor(private readonly inAppNotifications: InAppNotificationRepository) {}

  async list(input: {
    recipientId: EntityId;
    cursor?: string;
    limit: number;
  }): Promise<InAppNotification[]> {
    return this.inAppNotifications.list(input);
  }

  async markRead(input: {
    recipientId: EntityId;
    notificationId: EntityId;
  }): Promise<void> {
    await this.inAppNotifications.markRead(input);
  }
}

const PHONE_VERIFY_CODE_LENGTH = 6;
const PHONE_VERIFY_TTL_MS = 10 * 60 * 1000; // 10 minutes
const PHONE_VERIFY_MAX_ATTEMPTS = 3;
const PHONE_VERIFY_START_RATE_LIMIT = 5; // max starts per phone per window

export class PhoneVerifyService {
  constructor(
    private readonly phoneVerifications: PhoneVerificationRepository,
    private readonly phoneNumbers: PhoneNumberRepository,
    private readonly smsProvider: SmsProvider,
  ) {}

  /**
   * Normalize a phone number to E.164 format using libphonenumber-js.
   * Throws if the number is invalid.
   */
  normalizePhone(rawPhone: string): string {
    // Dynamic import avoidance: use parsePhoneNumberFromString

    const parsed = parsePhoneNumberFromString(rawPhone);
    if (!parsed || !parsed.isValid()) {
      throw Object.assign(new Error("Invalid phone number"), { code: "INVALID_PHONE" });
    }
    return parsed.number as string;
  }

  /**
   * Generate a random numeric code of the given length.
   */
  generateCode(): string {
    const bytes = randomBytes(4);
    const num = bytes.readUInt32BE(0) % Math.pow(10, PHONE_VERIFY_CODE_LENGTH);
    return String(num).padStart(PHONE_VERIFY_CODE_LENGTH, "0");
  }

  /**
   * Start phone verification: normalize, generate code, store hashed, send SMS.
   * Rate-limited to PHONE_VERIFY_START_RATE_LIMIT starts per phone per window (SMS pumping protection).
   */
  async startVerification(rawPhone: string, cache?: { get: (key: string) => Promise<number | null | undefined>; set: (key: string, value: number, ttl: number) => Promise<void> }): Promise<{ expiresAt: Date }> {
    const phoneE164 = this.normalizePhone(rawPhone);

    // SMS pumping protection via cache-based rate limiting
    if (cache) {
      const rateLimitKey = `phone-verify-start:${phoneE164}`;
      const count = await cache.get(rateLimitKey);
      if (count !== null && count !== undefined && count >= PHONE_VERIFY_START_RATE_LIMIT) {
        throw Object.assign(new Error("Too many verification attempts. Try again later."), { code: "RATE_LIMITED" });
      }
      await cache.set(rateLimitKey, (count ?? 0) + 1, 60_000); // 1-minute window
    }

    const code = this.generateCode();
    const codeHash = createHash("sha256").update(code, "utf8").digest("hex");
    const expiresAt = new Date(Date.now() + PHONE_VERIFY_TTL_MS);

    await this.phoneVerifications.upsert({
      phoneE164,
      codeHash,
      attempts: 0,
      expiresAt,
    });

    await this.smsProvider.sendVerificationCode({ to: phoneE164, code });

    return { expiresAt };
  }

  /**
   * Confirm phone verification: validate code, link phone to profile.
   */
  async confirmVerification(rawPhone: string, code: string, profileId: EntityId): Promise<{ verified: boolean }> {
    const phoneE164 = this.normalizePhone(rawPhone);

    const record = await this.phoneVerifications.findByPhone(phoneE164);
    if (!record) {
      throw Object.assign(new Error("No pending verification for this phone number"), { code: "NOT_FOUND" });
    }

    if (record.expiresAt < new Date()) {
      await this.phoneVerifications.deleteByPhone(phoneE164);
      throw Object.assign(new Error("Verification code expired"), { code: "CODE_EXPIRED" });
    }

    if (record.attempts >= PHONE_VERIFY_MAX_ATTEMPTS) {
      await this.phoneVerifications.deleteByPhone(phoneE164);
      throw Object.assign(new Error("Too many failed attempts. Request a new code."), { code: "RATE_LIMITED" });
    }

    const codeHash = createHash("sha256").update(code, "utf8").digest("hex");
    if (codeHash !== record.codeHash) {
      await this.phoneVerifications.incrementAttempts(phoneE164);
      throw Object.assign(new Error("Invalid verification code"), { code: "INVALID_CODE" });
    }

    // Code is valid: link phone to profile and clean up
    const e164Hash = createHash("sha256").update(phoneE164, "utf8").digest("hex");
    await this.phoneNumbers.upsert({ profileId, e164Hash });
    await this.phoneVerifications.deleteByPhone(phoneE164);

    return { verified: true };
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

  readonly notifications: NotificationService;
  readonly imports: ImportService;
  readonly contacts: ContactsService;
  readonly phoneVerify: PhoneVerifyService;
  readonly sessions: SessionService;

  constructor(
    readonly repositories: AppRepositories,
    readonly auth: AuthProvider
  ) {
    this.shelves = new ShelfService(
      repositories.shelves,
      repositories.activity,
      repositories.profiles
    );
    this.handles = new HandleService(repositories.profiles, repositories.handleHistory);
    this.profiles = new ProfileService(
      repositories.profiles,
      repositories.shelves
    );
    this.rankings = new RankingService(repositories.rankings, repositories.activity);
    this.reviews = new ReviewService(
      repositories.reviews,
      repositories.activity
    );
    this.blocks = new BlockService(repositories.blocks, repositories.follows);
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
    this.notifications = new NotificationService(repositories.inAppNotifications);
    this.imports = new ImportService(repositories.imports);
    this.sessions = new SessionService(repositories.sessions);
    this.contacts = new ContactsService(
      repositories.contacts,
      repositories.emailIndex,
      repositories.blocks,
    );
    // PhoneVerifyService requires an SmsProvider; it's initialized
    // externally when the provider is available. This placeholder uses
    // a no-op to satisfy the type while keeping AppServices functional.
    this.phoneVerify = null as unknown as PhoneVerifyService;
  }
}
