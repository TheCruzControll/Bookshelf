import { createHash, randomBytes, subtle } from "node:crypto";
import { gzipSync } from "node:zlib";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import type {
  AccountDeletionRepository,
  ActivityRepository,
  AppRepositories,
  AppleJwksProvider,
  AppleTokenClaims,
  AuthIdentityRepository,
  AuthProvider,
  BlockFilter,
  BlockRepository,
  BookRepository,
  ContactsRepository,
  DeletedProfileTombstoneRepository,
  EmailIndexRepository,
  EmailProvider,
  FollowRepository,
  GoogleJwksProvider,
  GoogleTokenClaims,
  HandleHistoryRepository,
  ImportRepository,
  InAppNotificationRepository,
  ListRepository,
  NotificationRepository,
  MagicLinkRepository,
  PhoneNumberRepository,
  PhoneVerificationRepository,
  ProfileRepository,
  RankingRepository,
  RecommendationRepository,
  ReviewRepository,
  SessionRepository,
  SaltRepository,
  ShelfRepository,
  SmsProvider,
  StorageProvider,
} from "./ports";
import type { AccountDeletion, ActivityEvent, ActivityVerb, Block, Book, ContactsHash, ContentType, Edition, EmailIndex, EntityId, FeedItem, Follow, Import, InAppNotification, List, NotificationSetting, NotificationToken, OAuthIdentity, PhoneNumber, Profile, Ranking, Recommendation, Review, Shelf, ShelfAuthorType, ShelfItem, Visibility } from "./types";
import { normalizeIsbn } from "./isbn";
import type { ReuploadStrategy } from "./schemas/imports";
import { matchImportRow } from "./import-match";
import type { BookLookup, MatchResult, ViewerShelfStateLookup } from "./import-match";
import type { GoodreadsRow } from "./types";
import type { ContactsMatchProfile } from "./schemas/contacts";
import type { PeopleYouMayKnowProfile, PeopleYouMayKnowSource } from "./schemas/discover";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  NOTIFICATION_CAP_PER_ACTOR_DAY,
  NOTIFICATION_CAP_PER_RECIPIENT_DAY,
  NOTIFICATION_SETTINGS_KEY,
  NotificationSettingsSchema,
} from "./schemas/notifications";
import type {
  NotificationChannel,
  NotificationSettingsValue,
  NotificationTriggerInput,
  UpdateNotificationSettingsInput,
} from "./schemas/notifications";
import { scoreFromRank, isScoreUnlocked, redactScore } from "./score";
import type { GatedRanking } from "./score";
import { publishActivityEvent } from "./activity-publisher";
import { applyVisibilityFilter, filterFeedByVisibility } from "./visibility";
import type { ViewerCtx, ViewerRelationship } from "./visibility";
import type { PushDispatchOutcome, PushSender } from "./push";

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

/**
 * Encode a feed cursor from a group key and occurred_at timestamp.
 * Format: base64url(JSON({ groupKey, occurredAt: ISO string }))
 */
export function encodeFeedCursor(groupKey: string, occurredAt: Date): string {
  const payload = JSON.stringify({ groupKey, occurredAt: occurredAt.toISOString() });
  return Buffer.from(payload, "utf8").toString("base64url");
}

/**
 * Decode a feed cursor into its group key and occurred_at components.
 * Returns null if the cursor is malformed.
 */
export function decodeFeedCursor(cursor: string): { groupKey: string; occurredAt: Date } | null {
  try {
    const json = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as { groupKey?: string; occurredAt?: string };
    if (!parsed.groupKey || !parsed.occurredAt) return null;
    const date = new Date(parsed.occurredAt);
    if (isNaN(date.getTime())) return null;
    return { groupKey: parsed.groupKey, occurredAt: date };
  } catch {
    return null;
  }
}

/**
 * Group flat feed items into groups by groupKey, preserving chronological order.
 * Items without a groupKey are treated as their own single-item group.
 * Returns groups ordered newest-first (by the latest occurredAt in each group).
 */
export function groupFeedItems(items: FeedItem[]): Array<{ groupKey: string; occurredAt: Date; items: FeedItem[] }> {
  const groupMap = new Map<string, { groupKey: string; occurredAt: Date; items: FeedItem[] }>();
  const order: string[] = [];

  for (const item of items) {
    const key = item.event.groupKey ?? item.event.id;
    const existing = groupMap.get(key);
    if (existing) {
      existing.items.push(item);
      // occurredAt of the group is the earliest event (group start)
      if (item.event.occurredAt < existing.occurredAt) {
        existing.occurredAt = item.event.occurredAt;
      }
    } else {
      const group = { groupKey: key, occurredAt: item.event.occurredAt, items: [item] };
      groupMap.set(key, group);
      order.push(key);
    }
  }

  return order.map((key) => groupMap.get(key)!);
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

/**
 * Input to {@link BookService.createManual}. Mirrors the shape of the
 * `books.createManual` tRPC procedure (#75): the viewer supplies a title,
 * one or more authors, and optionally an ISBN, publish year, and cover URL.
 *
 * `isbn` accepts either ISBN-10 or ISBN-13; the service normalizes to
 * ISBN-13 (see `normalizeIsbn`). Authors are currently flattened into the
 * Book's `description` placeholder — a future migration (#74 / authors
 * table) will replace this with a proper join.
 */
export interface CreateManualBookInput {
  title: string;
  authors: string[];
  isbn?: string;
  year?: number;
  coverUrl?: string;
}

export class BookService {
  constructor(private readonly books: BookRepository) {}

  /**
   * Create a Book + Edition pair from manually-entered metadata. The
   * resulting Edition has `source: "manual"` to mark it as user-provided
   * (vs. coming from an external catalog like Open Library or Google Books).
   *
   * Validation:
   *  - `title` must be non-empty after trimming.
   *  - `authors` must contain at least one non-empty entry.
   *  - `isbn`, when provided, must be a valid ISBN-10 or ISBN-13 (checksum
   *    verified); we store the normalized ISBN-13 form so the resulting
   *    Edition can later be matched against catalog hits.
   */
  async createManual(input: CreateManualBookInput): Promise<{ book: Book; edition: Edition }> {
    const title = input.title.trim();
    if (title.length === 0) {
      throw Object.assign(new Error("Title is required"), { code: "INVALID_INPUT" });
    }
    const authors = input.authors.map((a) => a.trim()).filter((a) => a.length > 0);
    if (authors.length === 0) {
      throw Object.assign(new Error("At least one author is required"), { code: "INVALID_INPUT" });
    }

    let isbn13: string | undefined;
    if (input.isbn !== undefined && input.isbn.trim().length > 0) {
      try {
        isbn13 = normalizeIsbn(input.isbn);
      } catch (err) {
        const cause = err instanceof Error ? err.message : String(err);
        throw Object.assign(new Error(`Invalid ISBN: ${cause}`), { code: "INVALID_INPUT" });
      }
    }

    return this.books.createManual({
      title,
      authors,
      isbn13,
      firstPublishedYear: input.year,
      coverUrl: input.coverUrl,
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

/** Threshold at or above which a finished book triggers the
 * `mutual_rated_high` push (#148, Q-04 trigger #3). The 1–10 score is
 * derived from rank via `scoreFromRank`. */
export const MUTUAL_RATED_HIGH_THRESHOLD = 8;

/** Slug of the system "Want to Read" shelf consulted for trigger #4. */
const WANT_TO_READ_SLUG = "want-to-read";

export class RankingService {
  constructor(
    private readonly rankings: RankingRepository,
    private readonly activity: ActivityRepository,
    private readonly follows?: FollowRepository,
    private readonly shelves?: ShelfRepository,
    private readonly notifications?: NotificationService,
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

    // (#148, Q-04, triggers #3/#4) Fan out direct-social pushes for the
    // finished book. The trigger-point service owns the recipient
    // resolution; NotificationService owns the gating (caps, quiet hours,
    // per-trigger toggles).
    await this.fanOutFinishedBookPushes({
      actorId: input.ownerId,
      bookId: input.bookId,
      score,
    });

    // Event is guaranteed non-null when scoreSnapshot is provided.
    return { ranking, event: event! };
  }

  /**
   * Start a rerank flow: verify the book is already ranked, check version
   * for optimistic locking, then restart the ranking session with a new bucket.
   *
   * The old ranking row is preserved until the compare flow completes and
   * finishBook is called with the new position.
   */
  async rerank(input: {
    ownerId: EntityId;
    bookId: EntityId;
    version: number;
    bucket: number;
  }): Promise<Ranking> {
    const existing = await this.rankings.findByOwnerAndBook({
      ownerId: input.ownerId,
      bookId: input.bookId,
    });

    if (!existing) {
      throw Object.assign(new Error("Ranking not found"), { code: "NOT_FOUND" });
    }

    if (existing.version !== input.version) {
      throw Object.assign(new Error("Version conflict"), {
        code: "VERSION_CONFLICT",
        currentVersion: existing.version,
      });
    }

    return this.rankings.startBucket({
      ownerId: input.ownerId,
      bookId: input.bookId,
      bucket: input.bucket,
    });
  }

  /**
   * Finish a rerank flow: update ranking with new position, compute new score,
   * and publish a new activity event. The old feed event retains its frozen score.
   */
  async finishRerank(input: {
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

    // Publish a NEW book_ranked event; old events retain their frozen scores.
    const event = await publishActivityEvent(this.activity, this.rankings, {
      actorId: input.ownerId,
      verb: "book_ranked",
      bookId: input.bookId,
      visibility: "followers",
      scoreSnapshot: {
        score,
        locked: input.total < 10,
      },
    });

    // (#148, Q-04, trigger #3) A rerank can newly push a book into the 8+
    // band — fan out the mutual_rated_high notification on those edges.
    // The WTR fan-out (#4) is intentionally skipped here: trigger #4 is
    // semantically scoped to the moment a book is *first* finished, not
    // every rerank. Reranks don't change which mutuals have the book on
    // their Want-to-Read shelf in a way that's user-meaningful.
    await this.fanOutHighRatingPush({
      actorId: input.ownerId,
      bookId: input.bookId,
      score,
    });

    return { ranking, event: event! };
  }

  /**
   * Fan-out helper for the post-finish notifications (triggers #3 and #4).
   * No-op when notification/follow/shelf collaborators aren't wired (e.g.
   * minimal test constructions) so callers don't need to thread no-op
   * dependencies through.
   */
  private async fanOutFinishedBookPushes(input: {
    actorId: EntityId;
    bookId: EntityId;
    score: number;
  }): Promise<void> {
    if (!this.notifications || !this.follows) return;

    const mutualIds = await this.follows.listMutualIds(input.actorId);
    if (mutualIds.length === 0) return;

    if (input.score >= MUTUAL_RATED_HIGH_THRESHOLD) {
      for (const recipientId of mutualIds) {
        await this.notifications.enqueueDirectSocialPush({
          recipientId,
          actorId: input.actorId,
          trigger: "mutual_rated_high",
          payload: {
            actorId: input.actorId,
            bookId: input.bookId,
            score: input.score,
          },
        });
      }
    }

    if (this.shelves) {
      const wtrOwners = await this.shelves.listOwnersWithBookOnSystemShelf({
        bookId: input.bookId,
        slug: WANT_TO_READ_SLUG,
        ownerIds: mutualIds,
      });
      for (const recipientId of wtrOwners) {
        await this.notifications.enqueueDirectSocialPush({
          recipientId,
          actorId: input.actorId,
          trigger: "mutual_finished_want_to_read",
          payload: {
            actorId: input.actorId,
            bookId: input.bookId,
          },
        });
      }
    }
  }

  private async fanOutHighRatingPush(input: {
    actorId: EntityId;
    bookId: EntityId;
    score: number;
  }): Promise<void> {
    if (!this.notifications || !this.follows) return;
    if (input.score < MUTUAL_RATED_HIGH_THRESHOLD) return;
    const mutualIds = await this.follows.listMutualIds(input.actorId);
    for (const recipientId of mutualIds) {
      await this.notifications.enqueueDirectSocialPush({
        recipientId,
        actorId: input.actorId,
        trigger: "mutual_rated_high",
        payload: {
          actorId: input.actorId,
          bookId: input.bookId,
          score: input.score,
        },
      });
    }
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
    private readonly blocks: BlockRepository,
    private readonly notifications?: NotificationService,
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

    // Idempotent: if already following, return existing — no push fires on
    // re-follow because the edge was not newly created.
    const existing = await this.follows.findFollow(input);
    if (existing) {
      return existing;
    }

    // Detect mutual-follow-back BEFORE creating the new edge: the reverse
    // edge must already exist for this follow to make the relationship
    // mutual. We delegate enqueueing to NotificationService so the gating
    // (quiet hours, caps, per-trigger toggles) lives in one place.
    const reverseEdge = await this.follows.findFollow({
      followerId: input.followeeId,
      followeeId: input.followerId,
    });

    const created = await this.follows.follow(input);

    if (this.notifications) {
      if (reverseEdge) {
        // (#148, Q-04, trigger #2) Mutual follow back. The new edge makes
        // the relationship mutual; notify the original follower (the
        // followee of this new edge) that their follow has been
        // reciprocated. The more-specific trigger replaces the plain
        // new_follower push so we don't double-notify on the same action.
        await this.notifications.enqueueDirectSocialPush({
          recipientId: input.followeeId,
          actorId: input.followerId,
          trigger: "mutual_follow_back",
          payload: { followerId: input.followerId, followeeId: input.followeeId },
        });
      } else {
        // (#148, Q-04, trigger #1) New follower → notify the followee.
        await this.notifications.enqueueDirectSocialPush({
          recipientId: input.followeeId,
          actorId: input.followerId,
          trigger: "new_follower",
          payload: { followerId: input.followerId, followeeId: input.followeeId },
        });
      }
    }

    return created;
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
    const blockFiltered = await this.blockService.removeBlockedFeedItems(input.viewerId, items);

    const actorIds = [...new Set(blockFiltered.map((item) => item.event.actorId))];
    const relationshipMap = new Map<EntityId, ViewerRelationship>();
    await Promise.all(
      actorIds.map(async (actorId) => {
        if (actorId === input.viewerId) {
          relationshipMap.set(actorId, "self");
        } else {
          const mutual = await this.follows.isMutual({ userA: input.viewerId, userB: actorId });
          relationshipMap.set(actorId, mutual ? "mutual" : "follower");
        }
      })
    );

    return filterFeedByVisibility(input.viewerId, blockFiltered, relationshipMap);
  }

  /**
   * Fetch grouped feed with cursor pagination on group boundaries.
   * Returns complete groups and a cursor pointing at the last group boundary.
   */
  async getFriendFeedGrouped(input: {
    viewerId: EntityId;
    cursor?: string;
    groupLimit: number;
  }): Promise<{ groups: Array<{ groupKey: string; occurredAt: Date; items: FeedItem[] }>; nextCursor: string | null }> {
    const decoded = input.cursor ? decodeFeedCursor(input.cursor) : null;

    const feedInput: {
      viewerId: EntityId;
      beforeOccurredAt?: Date;
      beforeGroupKey?: string;
      groupLimit: number;
    } = {
      viewerId: input.viewerId,
      groupLimit: input.groupLimit,
    };
    if (decoded) {
      feedInput.beforeOccurredAt = decoded.occurredAt;
      feedInput.beforeGroupKey = decoded.groupKey;
    }

    const items = await this.activity.getFriendFeedGrouped(feedInput);

    const blockFiltered = await this.blockService.removeBlockedFeedItems(input.viewerId, items);

    const actorIds = [...new Set(blockFiltered.map((item) => item.event.actorId))];
    const relationshipMap = new Map<EntityId, ViewerRelationship>();
    await Promise.all(
      actorIds.map(async (actorId) => {
        if (actorId === input.viewerId) {
          relationshipMap.set(actorId, "self");
        } else {
          const mutual = await this.follows.isMutual({ userA: input.viewerId, userB: actorId });
          relationshipMap.set(actorId, mutual ? "mutual" : "follower");
        }
      })
    );

    const filtered = filterFeedByVisibility(input.viewerId, blockFiltered, relationshipMap);
    const groups = groupFeedItems(filtered);

    // Trim to requested group limit
    const page = groups.slice(0, input.groupLimit);

    // Compute next cursor from the last group in the page
    let nextCursor: string | null = null;
    if (page.length === input.groupLimit && groups.length > input.groupLimit) {
      const lastGroup = page[page.length - 1]!;
      nextCursor = encodeFeedCursor(lastGroup.groupKey, lastGroup.occurredAt);
    }

    return { groups: page, nextCursor };
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

  /**
   * People-You-May-Know surface for the Discover tab (#144, P-08).
   *
   * Combines two candidate sources:
   *   1. **Contacts match** — profiles whose hashed phone number overlaps with
   *      the viewer's uploaded contacts (#96).
   *   2. **Friend-of-friend (FoF)** — profiles followed by users the viewer
   *      follows but that the viewer does not yet follow themselves. The FoF
   *      candidate count (number of shared follows) is used to rank.
   *
   * Excludes, in order:
   *   - The viewer themselves.
   *   - Soft-deleted profiles (missing from `profiles.findById`).
   *   - Blocked users in either direction (`BlockService.removeBlockedIds`).
   *   - Mutuals (the viewer's `listMutualIds`) — they are already connected
   *     and would be noise on a discovery surface.
   *   - Profiles whose `defaultVisibility.identity` is not visible to the
   *     viewer's relationship under `applyVisibilityFilter`.
   *
   * Source attribution is `"contacts"`, `"fof"`, or `"both"` when the
   * candidate is surfaced by both queries. Results are deduped on
   * `profileId`, ranked by (mutualCount desc, FoF count desc) so candidates
   * with more shared social fabric float to the top.
   *
   * Per Q4 lock this is a purely passive surface — no push, no email.
   */
  async getPeopleYouMayKnow(input: {
    viewerId: EntityId;
    limit: number;
  }): Promise<PeopleYouMayKnowProfile[]> {
    const { viewerId, limit } = input;

    const [contactsMatches, fofRows, mutualIds] = await Promise.all([
      this.contacts.findMatchingProfilesByPhone(viewerId),
      this.follows.listFriendsOfFriends(viewerId),
      this.follows.listMutualIds(viewerId),
    ]);

    const mutualSet = new Set<EntityId>(mutualIds);

    // Source attribution per candidate id.
    const contactsSet = new Set<EntityId>(contactsMatches);
    const fofCountByCandidate = new Map<EntityId, number>();
    for (const row of fofRows) {
      fofCountByCandidate.set(row.profileId, row.count);
    }

    // Union of candidate ids from both sources, with self + mutuals excluded
    // up-front so we don't waste profile lookups on definite drops.
    const candidateIds = new Set<EntityId>();
    for (const id of contactsSet) {
      if (id !== viewerId && !mutualSet.has(id)) candidateIds.add(id);
    }
    for (const id of fofCountByCandidate.keys()) {
      if (id !== viewerId && !mutualSet.has(id)) candidateIds.add(id);
    }

    if (candidateIds.size === 0) return [];

    // Block filter (both directions). A single batched call is cheaper than
    // calling per-candidate inside the visibility loop.
    const allowedIds = await this.blockService.removeBlockedIds(
      viewerId,
      Array.from(candidateIds),
    );
    if (allowedIds.length === 0) return [];

    // Load profiles. Soft-deleted profiles return null from `findById` and
    // are dropped here — keeps PYMK in sync with account deletion (#150/#153).
    const loadedProfiles = await Promise.all(
      allowedIds.map((id) => this.profiles.findById(id)),
    );
    const profiles: Profile[] = loadedProfiles.filter((p): p is Profile => p !== null);
    if (profiles.length === 0) return [];

    // Resolve viewer's relationship with each candidate for the visibility
    // filter. PYMK is by definition "not yet mutual," but a candidate may
    // still be a one-way follower of the viewer (or the viewer of them) —
    // which changes which visibility tiers they pass.
    const relationships = new Map<EntityId, ViewerRelationship>();
    await Promise.all(
      profiles.map(async (p) => {
        if (p.id === viewerId) {
          relationships.set(p.id, "self");
          return;
        }
        // Mutuals are already excluded above; the only remaining tiers are
        // "follower" (viewer follows them) or "none".
        const viewerFollows = await this.follows.findFollow({
          followerId: viewerId,
          followeeId: p.id,
        });
        relationships.set(p.id, viewerFollows ? "follower" : "none");
      }),
    );

    // Apply identity-visibility filter per candidate. Posture C defaults
    // identity to `public`, so most profiles survive; we still run the check
    // so users who lock identity to `followers`/`mutuals`/`private` are
    // hidden from strangers, matching `contacts.match` semantics.
    type Annotated = { ownerId: EntityId; visibility: Visibility; profile: Profile };
    const visible: Profile[] = [];
    for (const p of profiles) {
      const annotated: Annotated = {
        ownerId: p.id,
        visibility: p.defaultVisibility.identity,
        profile: p,
      };
      const relationship = relationships.get(p.id) ?? "none";
      const viewerCtx: ViewerCtx = { viewerId, relationship };
      const survivors = applyVisibilityFilter(viewerCtx, [annotated]);
      if (survivors.length > 0) visible.push(p);
    }

    // Hydrate the wire shape: source attribution + mutual count for ranking.
    const hydrated = await Promise.all(
      visible.map(async (profile): Promise<{
        shape: PeopleYouMayKnowProfile;
        fofCount: number;
      }> => {
        const inContacts = contactsSet.has(profile.id);
        const fofCount = fofCountByCandidate.get(profile.id) ?? 0;
        const inFof = fofCount > 0;
        const source: PeopleYouMayKnowSource =
          inContacts && inFof ? "both" : inContacts ? "contacts" : "fof";
        const mutualCount = await this.follows.countMutuals(profile.id);
        const shape: PeopleYouMayKnowProfile = {
          profileId: profile.id,
          handle: profile.handle,
          displayName: profile.displayName,
          source,
        };
        if (profile.avatarUrl !== undefined) shape.avatarUrl = profile.avatarUrl;
        shape.mutualCount = mutualCount;
        return { shape, fofCount };
      }),
    );

    // Rank: candidates with higher mutual counts first, breaking ties by FoF
    // shared-friend count. Both signals matter — mutualCount reflects social
    // weight in the wider graph, fofCount the viewer's specific overlap.
    hydrated.sort((a, b) => {
      const am = a.shape.mutualCount ?? 0;
      const bm = b.shape.mutualCount ?? 0;
      if (am !== bm) return bm - am;
      return b.fofCount - a.fofCount;
    });

    return hydrated.slice(0, limit).map((h) => h.shape);
  }
}

export const REUPLOAD_OPTIONS: ReuploadStrategy[] = [
  "process_from_scratch",
  "merge_changes_only",
  "cancel",
];

export class ImportService {
  constructor(
    private readonly imports: ImportRepository,
    private readonly bookLookup?: BookLookup,
  ) {}

  /**
   * Match each parsed Goodreads row against the catalog and return a parallel
   * array of `MatchResult`s, one per input row. Used by the import pipeline to
   * bucket rows into Matched / Needs review / Unmatched / Conflict. See
   * `import-match.ts` for the underlying algorithm.
   *
   * `viewerState` is optional but required for conflict detection (#103):
   * when supplied, definitive (ISBN) matches whose viewer shelf status
   * differs from the row's Goodreads status are bucketed as `conflict`
   * instead of `matched`. Without `viewerState`, no conflict detection
   * happens — backwards-compatible with pre-#103 call sites.
   *
   * Throws when no book lookup port has been wired — this happens when
   * `AppServices` is constructed without the optional bookLookup dependency.
   */
  async matchRows(
    rows: readonly GoodreadsRow[],
    viewerState?: ViewerShelfStateLookup,
  ): Promise<MatchResult[]> {
    if (!this.bookLookup) {
      throw Object.assign(
        new Error("ImportService.matchRows requires a BookLookup adapter"),
        { code: "INTERNAL_ERROR" },
      );
    }
    const lookup = this.bookLookup;
    return Promise.all(
      rows.map((row) => matchImportRow(row, lookup, viewerState)),
    );
  }

  /**
   * Count how many `MatchResult`s in a parallel array landed in the
   * `conflict` bucket. Persisted on the `imports` row's `conflict_count`
   * column by the import committer (#106). Exposed as a small pure helper
   * here so the import pipeline can keep the count in sync without
   * re-implementing the bucket check.
   */
  countConflicts(results: readonly MatchResult[]): number {
    let n = 0;
    for (const r of results) {
      if (r.bucket === "conflict") n += 1;
    }
    return n;
  }

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

/**
 * Soft-deleted `contacts_index` rows are retained for at most this many
 * milliseconds before {@link ContactsService.purgeDisabled} hard-deletes
 * them. Per PRD J-06 the SLA is 24h.
 */
export const CONTACTS_DISABLE_PURGE_AGE_MS = 24 * 60 * 60 * 1000;

export class ContactsService {
  private readonly blockService: BlockService;

  constructor(
    private readonly contacts: ContactsRepository,
    private readonly emailIndex: EmailIndexRepository,
    private readonly blocks: BlockRepository,
    private readonly salts?: SaltRepository,
    private readonly profiles?: ProfileRepository,
    private readonly follows?: FollowRepository,
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

  /**
   * Find Hone profiles whose phone number matches one of the viewer's
   * previously-uploaded contact hashes. Joins `contacts_index` against
   * `phone_numbers`, removes blocked users in both directions, applies the
   * Posture C identity visibility filter, and returns a minimal public
   * profile shape suitable for the People-You-May-Know surface.
   *
   * Block enforcement is mandatory per docs/prd-backlog.md: blocking
   * removes the blocker from the blocked user's contacts-match surface in
   * both directions. Visibility enforcement uses the matched profile's
   * `defaultVisibility.identity` against the viewer's relationship
   * (self / mutual / follower / none).
   */
  async match(input: { viewerId: EntityId }): Promise<ContactsMatchProfile[]> {
    if (!this.profiles) {
      throw Object.assign(new Error("Profile repository not configured"), { code: "INTERNAL_ERROR" });
    }
    const matchedIds = await this.contacts.findMatchingProfilesByPhone(input.viewerId);
    if (matchedIds.length === 0) return [];

    const blockFiltered = await this.blockService.removeBlockedIds(input.viewerId, matchedIds);
    if (blockFiltered.length === 0) return [];

    const loadedProfiles = await Promise.all(
      blockFiltered.map((id) => this.profiles!.findById(id))
    );
    const profiles: Profile[] = loadedProfiles.filter((p): p is Profile => p !== null);
    if (profiles.length === 0) return [];

    const relationships = new Map<EntityId, ViewerRelationship>();
    await Promise.all(
      profiles.map(async (p) => {
        if (p.id === input.viewerId) {
          relationships.set(p.id, "self");
          return;
        }
        if (this.follows) {
          const mutual = await this.follows.isMutual({ userA: input.viewerId, userB: p.id });
          if (mutual) {
            relationships.set(p.id, "mutual");
            return;
          }
          const viewerFollows = await this.follows.findFollow({
            followerId: input.viewerId,
            followeeId: p.id,
          });
          relationships.set(p.id, viewerFollows ? "follower" : "none");
          return;
        }
        relationships.set(p.id, "none");
      })
    );

    type Annotated = { ownerId: EntityId; visibility: Visibility; profile: Profile };
    const visible: Annotated[] = [];
    for (const p of profiles) {
      const annotated: Annotated = {
        ownerId: p.id,
        visibility: p.defaultVisibility.identity,
        profile: p,
      };
      const relationship = relationships.get(p.id) ?? "none";
      const viewerCtx: ViewerCtx = { viewerId: input.viewerId, relationship };
      const survivors = applyVisibilityFilter(viewerCtx, [annotated]);
      if (survivors.length > 0) visible.push(annotated);
    }

    const withMutualCount = await Promise.all(
      visible.map(async ({ profile }) => {
        let mutualCount: number | undefined;
        if (this.follows) {
          mutualCount = await this.follows.countMutuals(profile.id);
        }
        const shape: ContactsMatchProfile = {
          profileId: profile.id,
          handle: profile.handle,
          displayName: profile.displayName,
        };
        if (profile.avatarUrl !== undefined) shape.avatarUrl = profile.avatarUrl;
        if (mutualCount !== undefined) shape.mutualCount = mutualCount;
        return shape;
      })
    );

    return withMutualCount;
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

  /**
   * Soft-disable the viewer's uploaded contacts (J-06, #98).
   *
   * Marks every `contacts_index` row owned by the viewer with
   * `disabledAt = now`. Disabled rows are hard-deleted no later than 24h
   * after the disable timestamp by {@link purgeDisabled}.
   */
  async disableSync(input: { viewerId: EntityId; now?: Date }): Promise<{ disabled: true }> {
    const now = input.now ?? new Date();
    await this.contacts.softDisable({ userId: input.viewerId, now });
    return { disabled: true };
  }

  /**
   * Scheduled cleanup of soft-disabled contact rows (J-06, #98).
   *
   * Hard-deletes every `contacts_index` row whose `disabledAt` is older
   * than `now - 24h`. Returns the number of rows purged so the cron
   * entry point can log a stable success summary. Idempotent.
   */
  async purgeDisabled(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - CONTACTS_DISABLE_PURGE_AGE_MS);
    return this.contacts.purgeOlderThan(cutoff);
  }
}

export class NotificationService {
  constructor(
    private readonly inAppNotifications: InAppNotificationRepository,
    private readonly notifications?: NotificationRepository,
    private readonly pushSender?: PushSender,
  ) {}

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

  /**
   * Load merged notification settings for a profile. Missing fields fall
   * back to `DEFAULT_NOTIFICATION_SETTINGS`. Invalid persisted blobs are
   * discarded (i.e. treated as "no override") rather than throwing.
   */
  async getSettings(profileId: EntityId): Promise<NotificationSettingsValue> {
    if (!this.notifications) return cloneDefaults();
    const row = await this.notifications.getSetting({
      profileId,
      key: NOTIFICATION_SETTINGS_KEY,
    });
    return mergeNotificationSettings(cloneDefaults(), row?.value);
  }

  /**
   * Apply a deep-partial update on top of the persisted settings and
   * write the merged result back. Returns the fully resolved settings.
   */
  async updateSettings(
    profileId: EntityId,
    partial: UpdateNotificationSettingsInput,
  ): Promise<NotificationSettingsValue> {
    if (!this.notifications) {
      throw new Error("NotificationService.updateSettings requires NotificationRepository");
    }
    const existing = await this.getSettings(profileId);
    const next = mergeNotificationSettings(existing, partial);
    NotificationSettingsSchema.parse(next);
    await this.notifications.setSetting({
      profileId,
      key: NOTIFICATION_SETTINGS_KEY,
      value: next,
    });
    return next;
  }

  /**
   * Determine whether a notification may be sent to `recipientId` from
   * `actorId` for the given `trigger` at time `now` against channel `channel`.
   *
   * Enforces all of:
   *  - master pause (`masterEnabled = false` → blocked)
   *  - per-channel toggle
   *  - per-trigger toggle (security_event ignores trigger toggle to avoid lockout)
   *  - quiet hours (security_event bypasses quiet hours)
   *  - global per-recipient cap (5 / 24h)
   *  - per-actor cap (3 / 24h, only when actorId is provided)
   */
  async canSend(input: {
    recipientId: EntityId;
    actorId?: EntityId;
    trigger: NotificationTriggerInput;
    channel: NotificationChannel;
    now: Date;
  }): Promise<{ allowed: true } | { allowed: false; reason: NotificationBlockedReason }> {
    const settings = await this.getSettings(input.recipientId);

    // security_event is treated as a safety-critical trigger that bypasses
    // master pause / quiet-hours / trigger toggle. It still respects caps.
    const isSecurity = input.trigger === "security_event";

    if (!isSecurity && !settings.masterEnabled) {
      return { allowed: false, reason: "master_paused" };
    }
    if (!settings.channels[input.channel]) {
      return { allowed: false, reason: "channel_disabled" };
    }
    if (!isSecurity && !settings.triggers[input.trigger]) {
      return { allowed: false, reason: "trigger_disabled" };
    }
    if (
      !isSecurity &&
      settings.quietHours.enabled &&
      isInQuietHours(input.now, settings.quietHours.startMinute, settings.quietHours.endMinute)
    ) {
      return { allowed: false, reason: "quiet_hours" };
    }

    const dayAgo = new Date(input.now.getTime() - 24 * 60 * 60 * 1000);
    const recipientCount = await this.inAppNotifications.countSince({
      recipientId: input.recipientId,
      since: dayAgo,
    });
    if (recipientCount >= NOTIFICATION_CAP_PER_RECIPIENT_DAY) {
      return { allowed: false, reason: "recipient_cap" };
    }
    if (input.actorId) {
      const actorCount = await this.inAppNotifications.countSinceByActor({
        recipientId: input.recipientId,
        actorId: input.actorId,
        since: dayAgo,
      });
      if (actorCount >= NOTIFICATION_CAP_PER_ACTOR_DAY) {
        return { allowed: false, reason: "actor_cap" };
      }
    }
    return { allowed: true };
  }

  /**
   * Enqueue a direct-social push for one of the four Q-04 triggers
   * (#148, Q18 minimal posture). The flow is:
   *
   *  1. Gate via `canSend(channel: "push")` — quiet hours, per-trigger toggle,
   *     channel toggle, master pause, recipient cap, and per-actor cap are
   *     all enforced here. If gating blocks delivery the push is dropped and
   *     no in-app row is created (matches the #147 cap behaviour).
   *  2. Persist the in-app row so the in-app notifications surface stays
   *     consistent even when push is muted by quiet hours / caps.
   *  3. Hand off to `PushSender.sendToProfile` when a sender is wired.
   *
   * The body/title are derived from the trigger so callers don't need to
   * compose copy. Per-token results are returned to aid testing and audit;
   * upstream failures don't throw.
   */
  async enqueueDirectSocialPush(input: {
    recipientId: EntityId;
    actorId?: EntityId | undefined;
    trigger: DirectSocialTrigger;
    payload?: Record<string, unknown> | undefined;
    now?: Date | undefined;
  }): Promise<EnqueueDirectSocialPushResult> {
    const now = input.now ?? new Date();
    const payload = input.payload ?? {};

    const decision = await this.canSend({
      recipientId: input.recipientId,
      ...(input.actorId ? { actorId: input.actorId } : {}),
      trigger: input.trigger,
      channel: "push",
      now,
    });
    if (!decision.allowed) {
      return { enqueued: false, reason: decision.reason };
    }

    const record = await this.inAppNotifications.create({
      recipientId: input.recipientId,
      ...(input.actorId ? { actorId: input.actorId } : {}),
      trigger: input.trigger,
      payload,
    });

    let dispatched: PushDispatchOutcome[] | undefined;
    if (this.pushSender) {
      const copy = directSocialPushCopy(input.trigger);
      dispatched = await this.pushSender.sendToProfile({
        recipientId: input.recipientId,
        payload: {
          title: copy.title,
          body: copy.body,
          trigger: input.trigger,
          data: {
            trigger: input.trigger,
            ...(input.actorId ? { actorId: input.actorId } : {}),
          },
        },
      });
    }

    return { enqueued: true, notification: record, dispatched };
  }
}

/** Triggers eligible for direct-social push (#148, Q18). `security_event` is excluded. */
export type DirectSocialTrigger =
  | "new_follower"
  | "mutual_follow_back"
  | "mutual_rated_high"
  | "mutual_finished_want_to_read";

export type EnqueueDirectSocialPushResult =
  | {
      enqueued: true;
      notification: InAppNotification;
      dispatched?: PushDispatchOutcome[] | undefined;
    }
  | { enqueued: false; reason: NotificationBlockedReason };

function directSocialPushCopy(
  trigger: DirectSocialTrigger,
): { title: string; body: string } {
  switch (trigger) {
    case "new_follower":
      return { title: "New follower", body: "Someone started following you." };
    case "mutual_follow_back":
      return { title: "Followed you back", body: "A mutual just followed you back." };
    case "mutual_rated_high":
      return { title: "Mutual loved a book", body: "A mutual rated a book 8 or higher." };
    case "mutual_finished_want_to_read":
      return {
        title: "A book on your Want to Read is in",
        body: "A mutual just finished a book on your Want to Read shelf.",
      };
  }
}

export type NotificationBlockedReason =
  | "master_paused"
  | "channel_disabled"
  | "trigger_disabled"
  | "quiet_hours"
  | "recipient_cap"
  | "actor_cap";

function cloneDefaults(): NotificationSettingsValue {
  return {
    masterEnabled: DEFAULT_NOTIFICATION_SETTINGS.masterEnabled,
    channels: { ...DEFAULT_NOTIFICATION_SETTINGS.channels },
    triggers: { ...DEFAULT_NOTIFICATION_SETTINGS.triggers },
    quietHours: { ...DEFAULT_NOTIFICATION_SETTINGS.quietHours },
  };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Deep-merge `partial` onto `base`, ignoring keys that don't exist on `base`. */
function mergeNotificationSettings(
  base: NotificationSettingsValue,
  partial: unknown,
): NotificationSettingsValue {
  if (!isPlainObject(partial)) return base;
  const out: NotificationSettingsValue = {
    masterEnabled: typeof partial.masterEnabled === "boolean" ? partial.masterEnabled : base.masterEnabled,
    channels: { ...base.channels },
    triggers: { ...base.triggers },
    quietHours: { ...base.quietHours },
  };
  if (isPlainObject(partial.channels)) {
    for (const k of Object.keys(out.channels) as Array<keyof typeof out.channels>) {
      const v = partial.channels[k];
      if (typeof v === "boolean") out.channels[k] = v;
    }
  }
  if (isPlainObject(partial.triggers)) {
    for (const k of Object.keys(out.triggers) as Array<keyof typeof out.triggers>) {
      const v = partial.triggers[k];
      if (typeof v === "boolean") out.triggers[k] = v;
    }
  }
  if (isPlainObject(partial.quietHours)) {
    if (typeof partial.quietHours.enabled === "boolean") {
      out.quietHours.enabled = partial.quietHours.enabled;
    }
    if (typeof partial.quietHours.startMinute === "number" && Number.isInteger(partial.quietHours.startMinute)) {
      const m = partial.quietHours.startMinute;
      if (m >= 0 && m < 24 * 60) out.quietHours.startMinute = m;
    }
    if (typeof partial.quietHours.endMinute === "number" && Number.isInteger(partial.quietHours.endMinute)) {
      const m = partial.quietHours.endMinute;
      if (m >= 0 && m < 24 * 60) out.quietHours.endMinute = m;
    }
  }
  return out;
}

/**
 * Quiet-hours check. `[start, end)` inclusive of start, exclusive of end. The
 * window wraps midnight when `start > end`. When `start === end` the window
 * is empty (never quiet) — consistent with a zero-width interval.
 */
function isInQuietHours(now: Date, startMinute: number, endMinute: number): boolean {
  const minutesNow = now.getUTCHours() * 60 + now.getUTCMinutes();
  if (startMinute === endMinute) return false;
  if (startMinute < endMinute) {
    return minutesNow >= startMinute && minutesNow < endMinute;
  }
  // Wraps midnight
  return minutesNow >= startMinute || minutesNow < endMinute;
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

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export class AccountDeletionService {
  constructor(
    private readonly accountDeletions: AccountDeletionRepository,
    private readonly sessions: SessionRepository,
    private readonly tombstones?: DeletedProfileTombstoneRepository,
  ) {}

  async requestDelete(profileId: EntityId): Promise<AccountDeletion> {
    const existing = await this.accountDeletions.findByProfileId(profileId);
    if (existing) {
      return existing;
    }

    const now = new Date();
    const deletion = await this.accountDeletions.create({
      profileId,
      requestedAt: now,
      hardDeleteAfter: new Date(now.getTime() + THIRTY_DAYS_MS),
    });

    await this.sessions.revokeAllForProfile(profileId);

    return deletion;
  }

  async cancelDelete(profileId: EntityId): Promise<boolean> {
    const existing = await this.accountDeletions.findByProfileId(profileId);
    if (!existing) {
      return false;
    }
    if (existing.hardDeleteAfter < new Date()) {
      return false;
    }
    await this.accountDeletions.delete(profileId);
    return true;
  }

  async isSoftDeleted(profileId: EntityId): Promise<boolean> {
    const deletion = await this.accountDeletions.findByProfileId(profileId);
    return deletion !== null;
  }

  /**
   * Hard-delete every account whose 30-day grace period has elapsed.
   *
   * Intended to be invoked daily by an external scheduler (see
   * `apps/api/src/scripts/run-hard-delete.ts`). For each expired
   * deletion record, every user-scoped row is removed in a single DB
   * transaction (reviews, lists / list items, shelves / shelf items,
   * ranking signals, activity / feed events, follower & following
   * relationships, blocks placed by the user, sessions, push tokens,
   * etc.) and the `account_deletions` row itself is removed last.
   *
   * Retention of blocks placed AGAINST the user is handled by #154
   * via the `blocks_against_hash` table and is intentionally out of
   * scope here.
   *
   * Tombstone reaping (S-06, #161): when a `DeletedProfileTombstoneRepository`
   * is wired, this method also reaps expired tombstones at the end of
   * the run so the public-profile route flips from `410 Gone` to
   * `404 Not Found` once the 60-day post-purge window has elapsed.
   *
   * @returns the number of accounts purged in this run.
   */
  async runHardDelete(now: Date = new Date()): Promise<number> {
    const expired = await this.accountDeletions.listExpired(now);
    let purged = 0;
    for (const deletion of expired) {
      await this.accountDeletions.purgeProfile(deletion.profileId);
      purged += 1;
    }
    if (this.tombstones) {
      await this.tombstones.purgeExpired(now);
    }
    return purged;
  }
}

/**
 * Default lifetime of a GDPR export signed URL. 24h is long enough for
 * a user to email themselves the link and download the archive, short
 * enough that a leaked URL has limited blast radius.
 */
export const ACCOUNT_EXPORT_URL_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Schema version embedded in every GDPR export. Bump on any breaking
 * change to the archive layout so downstream consumers can detect it.
 */
export const ACCOUNT_EXPORT_SCHEMA_VERSION = 1;

/**
 * Shape of the JSON document inside a GDPR export. Every field is the
 * personal data the platform holds for the requesting profile and only
 * the requesting profile — see `docs/runbook.md` for the human-facing
 * description. The shape is intentionally a plain object (not a class)
 * so it round-trips cleanly through `JSON.stringify` / `JSON.parse`.
 */
export interface AccountExportPayload {
  schemaVersion: number;
  /** ISO-8601 timestamp at which the export was assembled. */
  generatedAt: string;
  /** Subject of the export — always the requesting profile. */
  profileId: EntityId;
  profile: Profile | null;
  oauthIdentities: OAuthIdentity[];
  reviews: Review[];
  shelves: Shelf[];
  shelfItems: ShelfItem[];
  lists: List[];
  rankings: Ranking[];
  follows: { following: Follow[]; followers: Follow[] };
  blocks: { outgoing: Block[]; incoming: Block[] };
  activityEvents: ActivityEvent[];
  inAppNotifications: InAppNotification[];
  notificationTokens: NotificationToken[];
  notificationSettings: NotificationSetting[];
  contactsHashes: ContactsHash[];
  emailHashes: EmailIndex[];
  phoneNumber: PhoneNumber | null;
  imports: Import[];
}

/**
 * Builds a downloadable GDPR data export for a profile (issue #153).
 *
 * The service collects every user-scoped row owned by the requesting
 * profile via the repository ports — never touching another profile's
 * data — gzips the resulting JSON document, and hands the binary blob
 * to a `StorageProvider` which returns a signed URL that expires after
 * {@link ACCOUNT_EXPORT_URL_TTL_MS}.
 */
export class AccountExportService {
  constructor(
    private readonly repositories: AppRepositories,
    private readonly storage: StorageProvider,
    private readonly options: { ttlMs?: number; now?: () => Date } = {},
  ) {}

  /**
   * Assemble the in-memory archive payload. Pure(-ish) — only reads
   * from repositories, never writes. Exposed for unit tests; callers
   * should normally use {@link buildExport}.
   */
  async collectPayload(profileId: EntityId): Promise<AccountExportPayload> {
    const repos = this.repositories;
    const now = (this.options.now ?? (() => new Date()))();

    const [
      profile,
      oauthIdentities,
      reviewsList,
      shelvesList,
      shelfItemsList,
      listsList,
      rankingsList,
      following,
      followers,
      outgoingBlocks,
      incomingBlocks,
      activityEventsList,
      inAppList,
      tokens,
      settings,
      contactsHashes,
      emailHashes,
      phoneNumber,
      importsList,
    ] = await Promise.all([
      repos.profiles.findById(profileId),
      repos.authIdentities.listByProfile(profileId),
      repos.reviews.listByAuthor(profileId),
      repos.shelves.listShelves(profileId, profileId),
      repos.shelves.listShelfItemsByOwner(profileId),
      repos.lists.listByOwner(profileId, profileId),
      repos.rankings.listByOwner(profileId, profileId),
      repos.follows.listFollowing(profileId, profileId),
      repos.follows.listFollowers(profileId, profileId),
      repos.blocks.listBlockedByUser(profileId),
      repos.blocks.listBlockingUser(profileId),
      repos.activity.listByActor(profileId),
      repos.inAppNotifications.listAllByRecipient(profileId),
      repos.notifications.listTokensForProfile(profileId),
      repos.notifications.listSettings(profileId),
      repos.contacts.listByUser(profileId),
      repos.emailIndex.listByUser(profileId),
      repos.phoneNumbers.findByProfileId(profileId),
      repos.imports.listByOwner(profileId),
    ]);

    return {
      schemaVersion: ACCOUNT_EXPORT_SCHEMA_VERSION,
      generatedAt: now.toISOString(),
      profileId,
      profile,
      oauthIdentities,
      reviews: reviewsList,
      shelves: shelvesList,
      shelfItems: shelfItemsList,
      lists: listsList,
      rankings: rankingsList,
      follows: { following, followers },
      blocks: { outgoing: outgoingBlocks, incoming: incomingBlocks },
      activityEvents: activityEventsList,
      inAppNotifications: inAppList,
      notificationTokens: tokens,
      notificationSettings: settings,
      contactsHashes,
      emailHashes,
      phoneNumber,
      imports: importsList,
    };
  }

  /**
   * Build the GDPR export archive for `profileId` and return a signed
   * URL that points to a single gzipped JSON file (`profile.json.gz`).
   * The URL expires after {@link ACCOUNT_EXPORT_URL_TTL_MS} (24h by
   * default; override via `options.ttlMs`).
   */
  async buildExport(profileId: EntityId): Promise<{ url: string; expiresAt: Date }> {
    const payload = await this.collectPayload(profileId);
    const json = JSON.stringify(payload);
    const gz = gzipSync(Buffer.from(json, "utf8"));
    // gzipSync returns a Buffer; expose it to the storage port as a
    // plain Uint8Array to keep the port free of node-specific types.
    const body = new Uint8Array(gz.buffer, gz.byteOffset, gz.byteLength);
    const ttlMs = this.options.ttlMs ?? ACCOUNT_EXPORT_URL_TTL_MS;
    const now = (this.options.now ?? (() => new Date()))();
    const key = `account-exports/${profileId}/${now.getTime()}-profile.json.gz`;
    const { url, expiresAt } = await this.storage.putObject({
      key,
      body,
      contentType: "application/gzip",
      expiresInMs: ttlMs,
    });
    return { url, expiresAt };
  }
}

export class AppServices {
  readonly accountDeletion: AccountDeletionService;
  readonly accountExport: AccountExportService | null;
  readonly books: BookService;
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
    readonly auth: AuthProvider,
    options?: { bookLookup?: BookLookup; storage?: StorageProvider }
  ) {
    this.accountDeletion = new AccountDeletionService(
      repositories.accountDeletions,
      repositories.sessions,
      repositories.deletedProfileTombstones,
    );
    // The export service requires an object-storage adapter. Wire it
    // when one is supplied; otherwise leave it `null` so the API layer
    // can return a clear error from the export procedure.
    this.accountExport = options?.storage
      ? new AccountExportService(repositories, options.storage)
      : null;
    this.books = new BookService(repositories.books);
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
    this.notifications = new NotificationService(
      repositories.inAppNotifications,
      repositories.notifications,
    );
    this.rankings = new RankingService(
      repositories.rankings,
      repositories.activity,
      repositories.follows,
      repositories.shelves,
      this.notifications,
    );
    this.reviews = new ReviewService(
      repositories.reviews,
      repositories.activity
    );
    this.blocks = new BlockService(repositories.blocks, repositories.follows);
    this.follows = new FollowService(
      repositories.follows,
      repositories.blocks,
      this.notifications,
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
    this.imports = new ImportService(repositories.imports, options?.bookLookup);
    this.sessions = new SessionService(repositories.sessions);
    this.contacts = new ContactsService(
      repositories.contacts,
      repositories.emailIndex,
      repositories.blocks,
      repositories.salts,
      repositories.profiles,
      repositories.follows,
    );
    // PhoneVerifyService requires an SmsProvider; it's initialized
    // externally when the provider is available. This placeholder uses
    // a no-op to satisfy the type while keeping AppServices functional.
    this.phoneVerify = null as unknown as PhoneVerifyService;
  }
}
