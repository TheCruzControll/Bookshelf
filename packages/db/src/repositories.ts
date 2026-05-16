/**
 * repositories.ts — SQL adapters implementing every repository port from @hone/domain.
 *
 * Visibility filtering
 * --------------------
 * Every read that returns user-owned content MUST pass the results through
 * `applyVisibilityFilter` from `@hone/domain` before returning them to the caller:
 *
 *   import { applyVisibilityFilter } from "@hone/domain";
 *
 *   const items = await db.select()...;
 *   return applyVisibilityFilter(viewerCtx, items);
 *
 * `viewerCtx` is a `ViewerCtx` object carrying the viewer's id and their
 * relationship to the content owner ("self" | "mutual" | "follower" | "none").
 * Pass `{ viewerId: null, relationship: "none" }` for anonymous / unauthenticated
 * callers.
 *
 * Block enforcement
 * -----------------
 * After applying the visibility filter, pipe the surviving items through the
 * `BlockFilter` port to strip any content from users the viewer has blocked or
 * who have blocked the viewer:
 *
 *   const visible = applyVisibilityFilter(viewerCtx, items);
 *   return blockFilter.removeBlocked(viewerCtx.viewerId, visible);
 *
 * This two-step composition (visibility → block) must be applied on every
 * surface that returns content attributed to another user: shelves, reviews,
 * activity feed, rankings, lists, and search results.
 */
import { and, asc, desc, eq, gt, gte, ilike, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import type {
  AccountDeletion,
  AccountDeletionRepository,
  ActivityRepository,
  AppRepositories,
  AuthIdentityRepository,
  BlockRepository,
  BookRepository,
  ContactsHash,
  ContactsRepository,
  EmailIndex,
  EmailIndexRepository,
  EntityId,
  FeedItem,
  FollowRepository,
  HandleHistoryRepository,
  ImportRepository,
  InAppNotification,
  InAppNotificationRepository,
  NotificationTrigger,
  ListRepository,
  MagicLinkRepository,
  NotificationRepository,
  ProfileRepository,
  RankingRepository,
  Recommendation,
  RecommendationRepository,
  ReviewRepository,
  PhoneNumberRepository,
  PhoneVerificationRepository,
  Salt,
  SaltRepository,
  SessionRepository,
  ShelfRepository
} from "@hone/domain";
import { computeGroupKey, planCatalogMerge, POSTURE_C_DEFAULTS, SYSTEM_SHELVES } from "@hone/domain";
import type { BookSearchResult, CatalogMergeOutcome } from "@hone/domain";
import type { HoneDb } from "./client";
import {
  accountDeletions,
  activityEvents,
  authIdentities,
  blocks,
  books,
  contactsIndex,
  emailIndex,
  editions,
  follows,
  handleHistory,
  inAppNotifications,
  imports,
  magicLinkTokens,
  notificationSettings,
  notificationTokens,
  profiles,
  rankings,
  recommendationScores,
  reviews,
  salts,
  sessions,
  phoneNumbers,
  phoneVerifications,
  shelfItems,
  shelves,
  tasteVectors
} from "./schema";
import {
  toAccountDeletion,
  toActivityEvent,
  toBlock,
  toBook,
  toEdition,
  toFollow,
  toHandleHistory,
  toImport,
  toInAppNotification,
  toList,
  toListItem,
  toMagicLinkToken,
  toNotificationSetting,
  toNotificationToken,
  toOAuthIdentity,
  toPhoneNumber,
  toPhoneVerification,
  toProfile,
  toRanking,
  toReview,
  toSalt,
  toSession,
  toShelf,
  toShelfItem
} from "./mappers";

export class DrizzleAccountDeletionRepository implements AccountDeletionRepository {
  constructor(private readonly db: HoneDb) {}

  async create(input: {
    profileId: EntityId;
    requestedAt: Date;
    hardDeleteAfter: Date;
  }): Promise<AccountDeletion> {
    const [row] = await this.db
      .insert(accountDeletions)
      .values({
        profileId: input.profileId,
        requestedAt: input.requestedAt,
        hardDeleteAfter: input.hardDeleteAfter,
      })
      .onConflictDoNothing()
      .returning();
    if (!row) {
      const existing = await this.findByProfileId(input.profileId);
      if (existing) return existing;
      throw new Error("Failed to create account deletion record");
    }
    return toAccountDeletion(row);
  }

  async findByProfileId(profileId: EntityId): Promise<AccountDeletion | null> {
    const row = await this.db.query.accountDeletions.findFirst({
      where: eq(accountDeletions.profileId, profileId),
    });
    return row ? toAccountDeletion(row) : null;
  }

  async delete(profileId: EntityId): Promise<void> {
    await this.db
      .delete(accountDeletions)
      .where(eq(accountDeletions.profileId, profileId));
  }

  async listExpired(now: Date): Promise<AccountDeletion[]> {
    const rows = await this.db
      .select()
      .from(accountDeletions)
      .where(lte(accountDeletions.hardDeleteAfter, now))
      .orderBy(asc(accountDeletions.hardDeleteAfter));
    return rows.map(toAccountDeletion);
  }

  async purgeProfile(profileId: EntityId): Promise<void> {
    // Single transaction: every user-scoped row is removed atomically.
    // Order matters because foreign keys are NOT declared with
    // ON DELETE CASCADE in the schema — children must be deleted
    // before their parents.
    await this.db.transaction(async (tx) => {
      // 1. Activity / feed events authored by the user. Activity events
      //    can reference reviews and shelves owned by the user, so they
      //    must be removed before those parents.
      await tx.delete(activityEvents).where(eq(activityEvents.actorId, profileId));

      // 2. In-app notifications — both as recipient and as actor.
      await tx
        .delete(inAppNotifications)
        .where(
          or(
            eq(inAppNotifications.recipientId, profileId),
            eq(inAppNotifications.actorId, profileId),
          ),
        );

      // 3. Ranking signals.
      await tx.delete(rankings).where(eq(rankings.profileId, profileId));

      // 4. Reviews authored by the user.
      await tx.delete(reviews).where(eq(reviews.authorId, profileId));

      // 5. Shelf items / list items belonging to shelves owned by the
      //    user (lists live in the `shelves` table with kind="list").
      const ownedShelves = await tx
        .select({ id: shelves.id })
        .from(shelves)
        .where(eq(shelves.ownerId, profileId));
      if (ownedShelves.length > 0) {
        const shelfIds = ownedShelves.map((s) => s.id);
        await tx.delete(shelfItems).where(inArray(shelfItems.shelfId, shelfIds));
      }

      // 6. Shelves (and lists).
      await tx.delete(shelves).where(eq(shelves.ownerId, profileId));

      // 7. Taste vectors / recommendation scores.
      await tx
        .delete(recommendationScores)
        .where(eq(recommendationScores.userId, profileId));
      await tx.delete(tasteVectors).where(eq(tasteVectors.profileId, profileId));

      // 8. Push notification tokens & per-user notification settings.
      await tx
        .delete(notificationTokens)
        .where(eq(notificationTokens.profileId, profileId));
      await tx
        .delete(notificationSettings)
        .where(eq(notificationSettings.profileId, profileId));

      // 9. Follower / following relationships — clean both sides.
      await tx
        .delete(follows)
        .where(
          or(
            eq(follows.followerId, profileId),
            eq(follows.followeeId, profileId),
          ),
        );

      // 10. Blocks the user PLACED. Blocks placed AGAINST the user are
      //     retained via `blocks_against_hash` (#154) — leave those alone.
      // TODO(#154): when the blocks-against-hash migration lands, surface
      // the hashed phone for `blocks` rows where blockedId == profileId
      // into `blocks_against_hash` before deleting the source rows.
      await tx.delete(blocks).where(eq(blocks.blockerId, profileId));
      await tx.delete(blocks).where(eq(blocks.blockedId, profileId));

      // 11. Auth identities, phone number, contacts/email indexes,
      //     handle history, sessions, imports.
      await tx
        .delete(authIdentities)
        .where(eq(authIdentities.profileId, profileId));
      await tx.delete(phoneNumbers).where(eq(phoneNumbers.profileId, profileId));
      await tx
        .delete(contactsIndex)
        .where(eq(contactsIndex.profileId, profileId));
      await tx.delete(emailIndex).where(eq(emailIndex.profileId, profileId));
      await tx
        .delete(handleHistory)
        .where(eq(handleHistory.profileId, profileId));
      await tx.delete(sessions).where(eq(sessions.profileId, profileId));
      await tx.delete(imports).where(eq(imports.ownerId, profileId));

      // 12. Profile row itself.
      await tx.delete(profiles).where(eq(profiles.id, profileId));

      // 13. Finally, the account_deletions row.
      await tx
        .delete(accountDeletions)
        .where(eq(accountDeletions.profileId, profileId));
    });
  }
}

export class DrizzleProfileRepository implements ProfileRepository {
  constructor(private readonly db: HoneDb) {}

  async findById(id: EntityId) {
    const row = await this.db.query.profiles.findFirst({
      where: eq(profiles.id, id)
    });
    return row ? toProfile(row) : null;
  }

  async findByHandle(handle: string) {
    const row = await this.db.query.profiles.findFirst({
      where: eq(profiles.handle, handle)
    });
    return row ? toProfile(row) : null;
  }

  async create(input: Parameters<ProfileRepository["create"]>[0]) {
    const [row] = await this.db.insert(profiles).values(input).returning();
    if (!row) {
      throw new Error("Failed to create profile");
    }
    return toProfile(row);
  }

  async isHandleTaken(handle: string) {
    const row = await this.db.query.profiles.findFirst({
      where: ilike(profiles.handle, handle),
    });
    return row !== undefined;
  }

  async setHandle(input: { userId: EntityId; handle: string }) {
    const [row] = await this.db
      .update(profiles)
      .set({ handle: input.handle, updatedAt: new Date() })
      .where(eq(profiles.id, input.userId))
      .returning();
    if (!row) {
      throw new Error("Profile not found");
    }
    return toProfile(row);
  }
}

export class DrizzleBookRepository implements BookRepository {
  constructor(private readonly db: HoneDb) {}

  async findBookById(id: EntityId) {
    const row = await this.db.query.books.findFirst({
      where: eq(books.id, id)
    });
    return row ? toBook(row) : null;
  }

  async findEditionByIsbn(isbn: string) {
    const row = await this.db.query.editions.findFirst({
      where: or(eq(editions.isbn10, isbn), eq(editions.isbn13, isbn))
    });
    return row ? toEdition(row) : null;
  }

  async findBookByIsbn13(isbn13: string) {
    const row = await this.db
      .select({ book: books })
      .from(editions)
      .innerJoin(books, eq(editions.bookId, books.id))
      .where(eq(editions.isbn13, isbn13))
      .limit(1);
    return row[0] ? toBook(row[0].book) : null;
  }

  async search(query: string, limit: number) {
    const rows = await this.db
      .select()
      .from(books)
      .where(ilike(books.canonicalTitle, `%${query}%`))
      .limit(limit);

    return rows.map(toBook);
  }

  /**
   * Persist a catalog hit, applying the F-06 (#72) edition merge rules
   * (see `planCatalogMerge` in `@hone/domain`).
   *
   * The whole operation runs in a single transaction so concurrent
   * ingests of the same ISBN-13 cannot create duplicate Book rows. Within
   * the transaction we:
   *   1. look up an existing Book by `editions.isbn_13` (when present);
   *   2. ask the pure planner what to do;
   *   3. INSERT or UPDATE the Book row accordingly;
   *   4. upsert the Edition by `(source, source_key)`.
   */
  async upsertFromCatalogResult(
    result: BookSearchResult
  ): Promise<CatalogMergeOutcome> {
    return this.db.transaction(async (tx) => {
      const existing = result.isbn13
        ? await this.findExistingBookByIsbn13(tx, result.isbn13)
        : null;

      const plan = planCatalogMerge(result, existing);

      let bookRow;
      let bookCreated = false;
      let workIdBackfilled = false;

      if (plan.book.kind === "create") {
        const insertValues: typeof books.$inferInsert = {
          canonicalTitle: plan.book.attributes.canonicalTitle,
          subtitle: plan.book.attributes.subtitle ?? null,
          description: plan.book.attributes.description ?? null,
          coverUrl: plan.book.attributes.coverUrl ?? null,
          firstPublishedYear: plan.book.attributes.firstPublishedYear ?? null,
          olWorkId: plan.book.attributes.olWorkId ?? null,
        };
        const [inserted] = await tx
          .insert(books)
          .values(insertValues)
          .returning();
        if (!inserted) {
          throw new Error("Failed to insert book row");
        }
        bookRow = inserted;
        bookCreated = true;
      } else if (Object.keys(plan.book.patch).length > 0) {
        const [updated] = await tx
          .update(books)
          .set({
            olWorkId: plan.book.patch.olWorkId,
            updatedAt: new Date(),
          })
          .where(eq(books.id, plan.book.bookId))
          .returning();
        if (!updated) {
          throw new Error("Failed to update book row");
        }
        bookRow = updated;
        workIdBackfilled = plan.book.patch.olWorkId !== undefined;
      } else {
        // No book-level change required — just fetch the existing row.
        const fetched = await tx.query.books.findFirst({
          where: eq(books.id, plan.book.bookId),
        });
        if (!fetched) {
          throw new Error("Existing book disappeared mid-transaction");
        }
        bookRow = fetched;
      }

      // Upsert the edition by `(source, source_key)` when sourceKey is set;
      // otherwise fall back to a key-less insert. This makes repeated
      // ingestion of the same OL/GB hit idempotent.
      const existingEdition =
        plan.edition.sourceKey !== undefined
          ? await tx.query.editions.findFirst({
              where: and(
                eq(editions.source, plan.edition.source),
                eq(editions.sourceKey, plan.edition.sourceKey)
              ),
            })
          : null;

      let editionRow;
      let editionCreated = false;

      if (existingEdition) {
        // Attach to the resolved book id (in case sources collided across books).
        const [updated] = await tx
          .update(editions)
          .set({
            bookId: bookRow.id,
            isbn10: plan.edition.isbn10 ?? null,
            isbn13: plan.edition.isbn13 ?? null,
            title: plan.edition.title,
            publisher: plan.edition.publisher ?? null,
            publishedDate: plan.edition.publishedDate ?? null,
            pageCount: plan.edition.pageCount ?? null,
          })
          .where(eq(editions.id, existingEdition.id))
          .returning();
        if (!updated) {
          throw new Error("Failed to update edition row");
        }
        editionRow = updated;
      } else {
        const [inserted] = await tx
          .insert(editions)
          .values({
            bookId: bookRow.id,
            isbn10: plan.edition.isbn10 ?? null,
            isbn13: plan.edition.isbn13 ?? null,
            title: plan.edition.title,
            publisher: plan.edition.publisher ?? null,
            publishedDate: plan.edition.publishedDate ?? null,
            pageCount: plan.edition.pageCount ?? null,
            source: plan.edition.source,
            sourceKey: plan.edition.sourceKey ?? null,
          })
          .returning();
        if (!inserted) {
          throw new Error("Failed to insert edition row");
        }
        editionRow = inserted;
        editionCreated = true;
      }

      return {
        book: toBook(bookRow),
        edition: toEdition(editionRow),
        bookCreated,
        editionCreated,
        workIdBackfilled,
      };
    });
  }

  private async findExistingBookByIsbn13(
    tx: Parameters<Parameters<HoneDb["transaction"]>[0]>[0],
    isbn13: string
  ) {
    const row = await tx
      .select({ book: books })
      .from(editions)
      .innerJoin(books, eq(editions.bookId, books.id))
      .where(eq(editions.isbn13, isbn13))
      .limit(1);
    return row[0] ? toBook(row[0].book) : null;
  }
}

export class DrizzleShelfRepository implements ShelfRepository {
  constructor(private readonly db: HoneDb) {}

  async listShelves(ownerId: EntityId, viewerId?: EntityId) {
    const isOwner = viewerId === ownerId;
    const rows = await this.db
      .select()
      .from(shelves)
      .where(
        isOwner
          ? eq(shelves.ownerId, ownerId)
          : and(eq(shelves.ownerId, ownerId), eq(shelves.visibility, "public"))
      );

    return rows.map(toShelf);
  }

  async findById(id: EntityId) {
    const row = await this.db.query.shelves.findFirst({
      where: eq(shelves.id, id),
    });
    return row ? toShelf(row) : null;
  }

  async create(input: Parameters<ShelfRepository["create"]>[0]) {
    const [row] = await this.db
      .insert(shelves)
      .values({
        ownerId: input.ownerId,
        name: input.name,
        slug: input.slug,
        visibility: input.visibility,
        isSystem: false,
        kind: "custom" as const,
        authorType: "user" as const,
      })
      .returning();
    if (!row) {
      throw new Error("Failed to create shelf");
    }
    return toShelf(row);
  }

  async update(input: Parameters<ShelfRepository["update"]>[0]) {
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) updateData.name = input.name;
    if (input.visibility !== undefined) updateData.visibility = input.visibility;
    if (input.description !== undefined) updateData.description = input.description;

    const [row] = await this.db
      .update(shelves)
      .set({ ...updateData, version: input.version + 1 })
      .where(
        and(
          eq(shelves.id, input.id),
          eq(shelves.ownerId, input.ownerId),
          eq(shelves.version, input.version)
        )
      )
      .returning();
    if (!row) {
      throw new Error("Stale shelf version or shelf not found");
    }
    return toShelf(row);
  }

  async delete(input: Parameters<ShelfRepository["delete"]>[0]) {
    await this.db
      .delete(shelves)
      .where(and(eq(shelves.id, input.id), eq(shelves.ownerId, input.ownerId)));
  }

  async addBook(input: Parameters<ShelfRepository["addBook"]>[0]) {
    const [row] = await this.db
      .insert(shelfItems)
      .values({
        shelfId: input.shelfId,
        bookId: input.bookId,
        editionId: input.editionId,
        status: "want_to_read"
      })
      .returning();

    if (!row) {
      throw new Error("Failed to add book to shelf");
    }
    return toShelfItem(row);
  }

  async rankShelfItem(input: Parameters<ShelfRepository["rankShelfItem"]>[0]) {
    const [row] = await this.db
      .update(shelfItems)
      .set({ rank: input.rank, updatedAt: new Date() })
      .where(eq(shelfItems.id, input.shelfItemId))
      .returning();

    if (!row) {
      throw new Error("Failed to rank shelf item");
    }
    return toShelfItem(row);
  }

  async createSystemShelves(ownerId: EntityId) {
    const existing = await this.db
      .select()
      .from(shelves)
      .where(and(eq(shelves.ownerId, ownerId), eq(shelves.isSystem, true)));

    const existingSlugs = new Set(existing.map((r) => r.slug));
    const toCreate = SYSTEM_SHELVES.filter((def) => !existingSlugs.has(def.slug));

    if (toCreate.length > 0) {
      await this.db.insert(shelves).values(
        toCreate.map((def) => ({
          ownerId,
          name: def.name,
          slug: def.slug,
          visibility: def.visibility,
          isSystem: true,
          kind: "system" as const,
          authorType: "user" as const,
        }))
      );
    }

    const all = await this.db
      .select()
      .from(shelves)
      .where(and(eq(shelves.ownerId, ownerId), eq(shelves.isSystem, true)));

    return all.map(toShelf);
  }

  async findShelfItem(input: { shelfId: EntityId; bookId: EntityId }) {
    const row = await this.db.query.shelfItems.findFirst({
      where: and(
        eq(shelfItems.shelfId, input.shelfId),
        eq(shelfItems.bookId, input.bookId)
      ),
    });
    return row ? toShelfItem(row) : null;
  }

  async upsertShelfItem(input: {
    shelfId: EntityId;
    bookId: EntityId;
    editionId?: EntityId | undefined;
    notes?: string | undefined;
    position?: number | undefined;
  }) {
    const [row] = await this.db
      .insert(shelfItems)
      .values({
        shelfId: input.shelfId,
        bookId: input.bookId,
        editionId: input.editionId ?? null,
        notes: input.notes ?? null,
        position: input.position ?? null,
        status: "want_to_read",
      })
      .onConflictDoUpdate({
        target: [shelfItems.shelfId, shelfItems.bookId],
        set: {
          ...(input.editionId !== undefined ? { editionId: input.editionId } : {}),
          ...(input.notes !== undefined ? { notes: input.notes ?? null } : {}),
          ...(input.position !== undefined ? { position: input.position } : {}),
          updatedAt: new Date(),
        },
      })
      .returning();
    if (!row) throw new Error("Failed to upsert shelf item");
    return toShelfItem(row);
  }

  async deleteShelfItem(input: { shelfId: EntityId; bookId: EntityId }) {
    await this.db
      .delete(shelfItems)
      .where(
        and(
          eq(shelfItems.shelfId, input.shelfId),
          eq(shelfItems.bookId, input.bookId)
        )
      );
  }

  async getMaxPosition(shelfId: EntityId): Promise<number> {
    const result = await this.db
      .select({ maxPos: sql<number>`coalesce(max(${shelfItems.position}), -1)` })
      .from(shelfItems)
      .where(eq(shelfItems.shelfId, shelfId));
    return result[0]?.maxPos ?? -1;
  }

  async moveShelfItem(input: { shelfId: EntityId; bookId: EntityId; position: number }) {
    const [row] = await this.db
      .update(shelfItems)
      .set({ position: input.position, updatedAt: new Date() })
      .where(
        and(
          eq(shelfItems.shelfId, input.shelfId),
          eq(shelfItems.bookId, input.bookId)
        )
      )
      .returning();
    if (!row) throw new Error("Shelf item not found");
    return toShelfItem(row);
  }

  async listOwnersWithBookOnSystemShelf(input: {
    bookId: EntityId;
    slug: string;
    ownerIds: EntityId[];
  }): Promise<EntityId[]> {
    if (input.ownerIds.length === 0) return [];
    const rows = await this.db
      .select({ ownerId: shelves.ownerId })
      .from(shelfItems)
      .innerJoin(shelves, eq(shelfItems.shelfId, shelves.id))
      .where(
        and(
          eq(shelfItems.bookId, input.bookId),
          eq(shelves.slug, input.slug),
          eq(shelves.isSystem, true),
          inArray(shelves.ownerId, input.ownerIds)
        )
      );
    return rows.map((r) => r.ownerId);
  }

  async listShelfItemsByOwner(ownerId: EntityId) {
    const rows = await this.db
      .select({ item: shelfItems })
      .from(shelfItems)
      .innerJoin(shelves, eq(shelfItems.shelfId, shelves.id))
      .where(eq(shelves.ownerId, ownerId))
      .orderBy(asc(shelfItems.addedAt));
    return rows.map((r) => toShelfItem(r.item));
  }
}

export class DrizzleReviewRepository implements ReviewRepository {
  constructor(private readonly db: HoneDb) {}

  async findById(id: EntityId) {
    const row = await this.db.query.reviews.findFirst({
      where: eq(reviews.id, id),
    });
    return row ? toReview(row) : null;
  }

  async create(input: Parameters<ReviewRepository["create"]>[0]) {
    const [row] = await this.db.insert(reviews).values(input).returning();
    if (!row) {
      throw new Error("Failed to create review");
    }
    return toReview(row);
  }

  async update(input: Parameters<ReviewRepository["update"]>[0]) {
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (input.body !== undefined) updateData.body = input.body;
    if (input.visibility !== undefined) updateData.visibility = input.visibility;

    const [row] = await this.db
      .update(reviews)
      .set({ ...updateData, version: input.version + 1 })
      .where(
        and(
          eq(reviews.id, input.id),
          eq(reviews.authorId, input.authorId),
          eq(reviews.version, input.version)
        )
      )
      .returning();
    if (!row) {
      throw new Error("Stale review version or review not found");
    }
    return toReview(row);
  }

  async delete(input: { id: EntityId; authorId: EntityId }) {
    await this.db
      .delete(reviews)
      .where(
        and(eq(reviews.id, input.id), eq(reviews.authorId, input.authorId))
      );
  }

  async listByAuthor(authorId: EntityId) {
    const rows = await this.db
      .select()
      .from(reviews)
      .where(eq(reviews.authorId, authorId))
      .orderBy(desc(reviews.createdAt));
    return rows.map(toReview);
  }
}

export class DrizzleActivityRepository implements ActivityRepository {
  constructor(private readonly db: HoneDb) {}

  async append(event: Parameters<ActivityRepository["append"]>[0]) {
    const { scoreAtPublish, groupKey: _existingGroupKey, ...rest } = event;
    const occurredAt = new Date();
    const groupKey = computeGroupKey(rest.actorId, rest.verb, occurredAt);
    const [row] = await this.db.insert(activityEvents).values({
      ...rest,
      occurredAt,
      groupKey,
      scoreAtPublish: scoreAtPublish != null ? String(scoreAtPublish) : null,
    }).returning();
    if (!row) {
      throw new Error("Failed to append activity event");
    }
    return toActivityEvent(row);
  }

  async getFriendFeed(input: Parameters<ActivityRepository["getFriendFeed"]>[0]) {
    const followRows = await this.db
      .select({ followeeId: follows.followeeId })
      .from(follows)
      .where(eq(follows.followerId, input.viewerId));

    const friendIds = followRows.map((row) => row.followeeId);

    if (friendIds.length === 0) {
      return [];
    }

    const rows = await this.db
      .select()
      .from(activityEvents)
      .where(eq(activityEvents.visibility, "followers"))
      .orderBy(desc(activityEvents.occurredAt))
      .limit(input.limit);

    const friendEvents = rows
      .filter((row) => friendIds.includes(row.actorId))
      .map(toActivityEvent);

    const feedItems: FeedItem[] = friendEvents.map((event) => ({ event, actor: {
      id: event.actorId,
      handle: "unknown",
      displayName: "Unknown reader",
      verified: false,
      defaultVisibility: POSTURE_C_DEFAULTS,
      version: 1,
      createdAt: event.occurredAt,
      updatedAt: event.occurredAt
    }}));

    return feedItems;
  }

  async getFriendFeedGrouped(input: Parameters<ActivityRepository["getFriendFeedGrouped"]>[0]) {
    const followRows = await this.db
      .select({ followeeId: follows.followeeId })
      .from(follows)
      .where(eq(follows.followerId, input.viewerId));

    const friendIds = followRows.map((row) => row.followeeId);

    if (friendIds.length === 0) {
      return [];
    }

    // Build conditions for cursor-based pagination
    const conditions = [
      inArray(activityEvents.actorId, friendIds),
      eq(activityEvents.visibility, "followers"),
    ];

    if (input.beforeOccurredAt) {
      // Fetch events strictly before the cursor's occurredAt,
      // OR events at the same occurredAt but with a different groupKey
      // (to exclude the last group seen).
      conditions.push(
        or(
          lt(activityEvents.occurredAt, input.beforeOccurredAt),
          and(
            eq(activityEvents.occurredAt, input.beforeOccurredAt),
            input.beforeGroupKey
              ? sql`${activityEvents.groupKey} != ${input.beforeGroupKey}`
              : sql`true`
          )!
        )!
      );
    }

    // Over-fetch to ensure we capture complete groups at the boundary.
    // We fetch (groupLimit + 1) * 10 events, then group them.
    const overFetchLimit = (input.groupLimit + 1) * 10;

    const rows = await this.db
      .select()
      .from(activityEvents)
      .where(and(...conditions))
      .orderBy(desc(activityEvents.occurredAt))
      .limit(overFetchLimit);

    const friendEvents = rows.map(toActivityEvent);

    const feedItems: FeedItem[] = friendEvents.map((event) => ({ event, actor: {
      id: event.actorId,
      handle: "unknown",
      displayName: "Unknown reader",
      verified: false,
      defaultVisibility: POSTURE_C_DEFAULTS,
      version: 1,
      createdAt: event.occurredAt,
      updatedAt: event.occurredAt
    }}));

    return feedItems;
  }

  async deleteByReviewId(reviewId: EntityId) {
    await this.db
      .delete(activityEvents)
      .where(eq(activityEvents.reviewId, reviewId));
  }

  async listByActor(actorId: EntityId) {
    const rows = await this.db
      .select()
      .from(activityEvents)
      .where(eq(activityEvents.actorId, actorId))
      .orderBy(desc(activityEvents.occurredAt));
    return rows.map(toActivityEvent);
  }
}

export class DrizzleRecommendationRepository
  implements RecommendationRepository
{
  constructor(private readonly db: HoneDb) {}

  async getForUser(userId: EntityId, limit: number): Promise<Recommendation[]> {
    const rows = await this.db
      .select({
        book: books,
        score: recommendationScores.score,
        reason: recommendationScores.reason
      })
      .from(recommendationScores)
      .innerJoin(books, eq(recommendationScores.bookId, books.id))
      .where(eq(recommendationScores.userId, userId))
      .orderBy(desc(recommendationScores.score))
      .limit(limit);

    return rows.map((row) => ({
      book: toBook(row.book),
      score: row.score,
      reason: row.reason
    }));
  }
}

class DrizzleFollowRepository implements FollowRepository {
  constructor(private readonly db: HoneDb) {}

  async follow(input: { followerId: EntityId; followeeId: EntityId }) {
    const [row] = await this.db
      .insert(follows)
      .values({
        followerId: input.followerId,
        followeeId: input.followeeId,
      })
      .onConflictDoNothing()
      .returning();
    if (!row) {
      const existing = await this.findFollow(input);
      if (!existing) throw new Error("Failed to create follow");
      return existing;
    }
    return toFollow(row);
  }

  async unfollow(input: { followerId: EntityId; followeeId: EntityId }) {
    await this.db
      .delete(follows)
      .where(
        and(
          eq(follows.followerId, input.followerId),
          eq(follows.followeeId, input.followeeId)
        )
      );
  }

  async findFollow(input: { followerId: EntityId; followeeId: EntityId }) {
    const row = await this.db.query.follows.findFirst({
      where: and(
        eq(follows.followerId, input.followerId),
        eq(follows.followeeId, input.followeeId)
      ),
    });
    return row ? toFollow(row) : null;
  }

  async listFollowers(userId: EntityId, _viewerId?: EntityId) {
    const rows = await this.db
      .select()
      .from(follows)
      .where(eq(follows.followeeId, userId))
      .orderBy(desc(follows.createdAt));
    return rows.map(toFollow);
  }

  async listFollowing(userId: EntityId, _viewerId?: EntityId) {
    const rows = await this.db
      .select()
      .from(follows)
      .where(eq(follows.followerId, userId))
      .orderBy(desc(follows.createdAt));
    return rows.map(toFollow);
  }

  async isMutual(input: { userA: EntityId; userB: EntityId }) {
    const [aFollowsB, bFollowsA] = await Promise.all([
      this.db.query.follows.findFirst({
        where: and(
          eq(follows.followerId, input.userA),
          eq(follows.followeeId, input.userB)
        ),
      }),
      this.db.query.follows.findFirst({
        where: and(
          eq(follows.followerId, input.userB),
          eq(follows.followeeId, input.userA)
        ),
      }),
    ]);
    return aFollowsB !== undefined && bFollowsA !== undefined;
  }

  async countMutuals(userId: EntityId): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(follows)
      .innerJoin(
        sql`${follows} AS f2`,
        sql`${follows}.followee_id = f2.follower_id AND ${follows}.follower_id = f2.followee_id`
      )
      .where(eq(follows.followerId, userId));
    return result[0]?.count ?? 0;
  }

  async listMutualIds(userId: EntityId): Promise<EntityId[]> {
    // A user `m` is a mutual of `userId` iff `userId` follows `m` AND `m`
    // follows `userId`. Self-join the follows table on (followerId, followeeId)
    // flipped between the two sides.
    const rows = await this.db
      .select({ mutualId: follows.followeeId })
      .from(follows)
      .innerJoin(
        sql`${follows} AS f2`,
        sql`${follows}.followee_id = f2.follower_id AND ${follows}.follower_id = f2.followee_id`
      )
      .where(eq(follows.followerId, userId));
    return rows.map((r) => r.mutualId);
  }
}

class DrizzleBlockRepository implements BlockRepository {
  constructor(private readonly db: HoneDb) {}

  async block(input: { blockerId: EntityId; blockedId: EntityId }) {
    const [row] = await this.db
      .insert(blocks)
      .values({
        blockerId: input.blockerId,
        blockedId: input.blockedId,
      })
      .onConflictDoNothing()
      .returning();
    if (!row) {
      const existing = await this.findBlock(input);
      if (!existing) throw new Error("Failed to create block");
      return existing;
    }
    return toBlock(row);
  }

  async unblock(input: { blockerId: EntityId; blockedId: EntityId }) {
    await this.db
      .delete(blocks)
      .where(
        and(
          eq(blocks.blockerId, input.blockerId),
          eq(blocks.blockedId, input.blockedId)
        )
      );
  }

  async findBlock(input: { blockerId: EntityId; blockedId: EntityId }) {
    const row = await this.db.query.blocks.findFirst({
      where: and(
        eq(blocks.blockerId, input.blockerId),
        eq(blocks.blockedId, input.blockedId)
      ),
    });
    return row ? toBlock(row) : null;
  }

  async listBlockedByUser(blockerId: EntityId) {
    const rows = await this.db
      .select()
      .from(blocks)
      .where(eq(blocks.blockerId, blockerId))
      .orderBy(desc(blocks.createdAt));
    return rows.map(toBlock);
  }

  async listBlockingUser(blockedId: EntityId) {
    const rows = await this.db
      .select()
      .from(blocks)
      .where(eq(blocks.blockedId, blockedId))
      .orderBy(desc(blocks.createdAt));
    return rows.map(toBlock);
  }

  async isBlocked(input: { viewerId: EntityId; targetId: EntityId }) {
    const row = await this.db.query.blocks.findFirst({
      where: or(
        and(eq(blocks.blockerId, input.viewerId), eq(blocks.blockedId, input.targetId)),
        and(eq(blocks.blockerId, input.targetId), eq(blocks.blockedId, input.viewerId))
      ),
    });
    return row !== undefined;
  }
}

class DrizzleRankingRepository implements RankingRepository {
  constructor(private readonly db: HoneDb) {}

  async upsert(input: {
    ownerId: EntityId;
    bookId: EntityId;
    rank: number;
    score: number;
  }) {
    const [row] = await this.db
      .insert(rankings)
      .values({
        profileId: input.ownerId,
        bookId: input.bookId,
        position: input.rank,
        score: String(input.score),
        bucket: 0,
      })
      .onConflictDoUpdate({
        target: [rankings.profileId, rankings.bookId],
        set: {
          position: input.rank,
          score: String(input.score),
          version: sql`${rankings.version} + 1`,
          updatedAt: new Date(),
        },
      })
      .returning();
    if (!row) throw new Error("Failed to upsert ranking");
    return toRanking(row);
  }

  async findById(id: EntityId) {
    const row = await this.db.query.rankings.findFirst({
      where: eq(rankings.id, id),
    });
    return row ? toRanking(row) : null;
  }

  async findByOwnerAndBook(input: { ownerId: EntityId; bookId: EntityId }) {
    const row = await this.db.query.rankings.findFirst({
      where: and(
        eq(rankings.profileId, input.ownerId),
        eq(rankings.bookId, input.bookId)
      ),
    });
    return row ? toRanking(row) : null;
  }

  async listByOwner(ownerId: EntityId, _viewerId?: EntityId) {
    const rows = await this.db
      .select()
      .from(rankings)
      .where(eq(rankings.profileId, ownerId))
      .orderBy(asc(rankings.position));
    return rows.map(toRanking);
  }

  async delete(input: { ownerId: EntityId; bookId: EntityId }) {
    await this.db
      .delete(rankings)
      .where(
        and(
          eq(rankings.profileId, input.ownerId),
          eq(rankings.bookId, input.bookId)
        )
      );
  }

  async startBucket(input: {
    ownerId: EntityId;
    bookId: EntityId;
    bucket: number;
  }) {
    const [row] = await this.db
      .update(rankings)
      .set({ bucket: input.bucket, updatedAt: new Date() })
      .where(
        and(
          eq(rankings.profileId, input.ownerId),
          eq(rankings.bookId, input.bookId)
        )
      )
      .returning();
    if (!row) throw new Error("Ranking not found");
    return toRanking(row);
  }
}

class DrizzleNotificationRepository implements NotificationRepository {
  constructor(private readonly db: HoneDb) {}

  async registerToken(input: Parameters<NotificationRepository["registerToken"]>[0]) {
    const [row] = await this.db
      .insert(notificationTokens)
      .values({
        profileId: input.profileId,
        platform: input.platform,
        token: input.token,
        lastSeen: new Date(),
      })
      .onConflictDoUpdate({
        target: [notificationTokens.profileId, notificationTokens.platform, notificationTokens.token],
        set: { lastSeen: new Date() },
      })
      .returning();
    if (!row) throw new Error("Failed to register token");
    return toNotificationToken(row);
  }

  async removeToken(input: { profileId: EntityId; token: string }) {
    await this.db
      .delete(notificationTokens)
      .where(
        and(
          eq(notificationTokens.profileId, input.profileId),
          eq(notificationTokens.token, input.token)
        )
      );
  }

  async listTokensForProfile(profileId: EntityId) {
    const rows = await this.db
      .select()
      .from(notificationTokens)
      .where(eq(notificationTokens.profileId, profileId));
    return rows.map(toNotificationToken);
  }

  async getSetting(input: { profileId: EntityId; key: string }) {
    const row = await this.db.query.notificationSettings.findFirst({
      where: and(
        eq(notificationSettings.profileId, input.profileId),
        eq(notificationSettings.key, input.key)
      ),
    });
    return row ? toNotificationSetting(row) : null;
  }

  async setSetting(input: { profileId: EntityId; key: string; value: unknown }) {
    const [row] = await this.db
      .insert(notificationSettings)
      .values({
        profileId: input.profileId,
        key: input.key,
        value: input.value,
      })
      .onConflictDoUpdate({
        target: [notificationSettings.profileId, notificationSettings.key],
        set: { value: input.value },
      })
      .returning();
    if (!row) throw new Error("Failed to set notification setting");
    return toNotificationSetting(row);
  }

  async listSettings(profileId: EntityId) {
    const rows = await this.db
      .select()
      .from(notificationSettings)
      .where(eq(notificationSettings.profileId, profileId));
    return rows.map(toNotificationSetting);
  }
}

class DrizzleImportRepository implements ImportRepository {
  constructor(private readonly db: HoneDb) {}

  async create(input: Parameters<ImportRepository["create"]>[0]) {
    const [row] = await this.db
      .insert(imports)
      .values({
        id: input.id,
        ownerId: input.ownerId,
        source: input.source,
        idempotencyHash: input.idempotencyHash ?? null,
        status: "pending",
      })
      .returning();
    if (!row) throw new Error("Failed to create import");
    return toImport(row);
  }

  async findById(id: EntityId) {
    const row = await this.db.query.imports.findFirst({
      where: eq(imports.id, id),
    });
    return row ? toImport(row) : null;
  }

  async findByOwnerAndHash(input: { ownerId: EntityId; hash: string }) {
    const row = await this.db.query.imports.findFirst({
      where: and(
        eq(imports.ownerId, input.ownerId),
        eq(imports.idempotencyHash, input.hash)
      ),
    });
    return row ? toImport(row) : null;
  }

  async listByOwner(ownerId: EntityId) {
    const rows = await this.db
      .select()
      .from(imports)
      .where(eq(imports.ownerId, ownerId))
      .orderBy(desc(imports.createdAt));
    return rows.map(toImport);
  }

  async updateStatus(input: Parameters<ImportRepository["updateStatus"]>[0]) {
    const [row] = await this.db
      .update(imports)
      .set({
        status: input.status,
        completedAt: input.completedAt ?? null,
      })
      .where(eq(imports.id, input.id))
      .returning();
    if (!row) throw new Error("Import not found");
    return toImport(row);
  }
}

class DrizzleContactsRepository implements ContactsRepository {
  constructor(private readonly db: HoneDb) {}

  async upsertHashes(input: {
    userId: EntityId;
    hashes: Array<{ hash: string; saltVersion: number; expiresAt: Date }>;
  }) {
    if (input.hashes.length === 0) return;
    await this.db
      .insert(contactsIndex)
      .values(
        input.hashes.map((h) => ({
          profileId: input.userId,
          contactHash: h.hash,
          saltVersion: h.saltVersion,
          expiresAt: h.expiresAt,
        }))
      )
      .onConflictDoUpdate({
        target: [contactsIndex.profileId, contactsIndex.contactHash],
        set: {
          saltVersion: sql`excluded.salt_version`,
          expiresAt: sql`excluded.expires_at`,
        },
      });
  }

  async findMatches(input: { hashes: string[]; excludeUserId: EntityId }) {
    if (input.hashes.length === 0) return [];
    const now = new Date();
    const rows = await this.db
      .select({ profileId: contactsIndex.profileId })
      .from(contactsIndex)
      .where(
        and(
          inArray(contactsIndex.contactHash, input.hashes),
          gt(contactsIndex.expiresAt, now),
          isNull(contactsIndex.disabledAt)
        )
      );
    return rows
      .map((r) => r.profileId)
      .filter((id) => id !== input.excludeUserId);
  }

  /**
   * Join contacts_index (viewer's uploaded contact hashes) against
   * phone_numbers to discover Hone profiles whose normalized phone hash
   * matches one of the viewer's contacts. Excludes the viewer and any
   * contact-index rows whose `expiresAt` has passed or that the viewer
   * has soft-disabled (see `contacts.disableSync`, #98).
   */
  async findMatchingProfilesByPhone(viewerId: EntityId): Promise<EntityId[]> {
    const now = new Date();
    const rows = await this.db
      .select({ profileId: phoneNumbers.profileId })
      .from(contactsIndex)
      .innerJoin(phoneNumbers, eq(contactsIndex.contactHash, phoneNumbers.e164Hash))
      .where(
        and(
          eq(contactsIndex.profileId, viewerId),
          gt(contactsIndex.expiresAt, now),
          isNull(contactsIndex.disabledAt)
        )
      );
    const seen = new Set<EntityId>();
    const out: EntityId[] = [];
    for (const r of rows) {
      if (r.profileId === viewerId) continue;
      if (seen.has(r.profileId)) continue;
      seen.add(r.profileId);
      out.push(r.profileId);
    }
    return out;
  }

  async deleteForUser(userId: EntityId) {
    await this.db
      .delete(contactsIndex)
      .where(eq(contactsIndex.profileId, userId));
  }

  async deleteExpired() {
    const now = new Date();
    await this.db
      .delete(contactsIndex)
      .where(lt(contactsIndex.expiresAt, now));
  }

  async expireBySaltVersion(saltVersion: number, expiresAt: Date): Promise<number> {
    const result = await this.db
      .update(contactsIndex)
      .set({ expiresAt })
      .where(eq(contactsIndex.saltVersion, saltVersion))
      .returning();
    return result.length;
  }

  async deleteByTargetHash(hashes: string[]): Promise<void> {
    if (hashes.length === 0) return;
    await this.db.delete(contactsIndex).where(inArray(contactsIndex.contactHash, hashes));
  }

  async listByUser(userId: EntityId): Promise<ContactsHash[]> {
    const rows = await this.db
      .select()
      .from(contactsIndex)
      .where(eq(contactsIndex.profileId, userId));
    return rows.map((row) => ({
      id: `${row.profileId}:${row.contactHash}`,
      userId: row.profileId,
      hash: row.contactHash,
      saltVersion: row.saltVersion,
      createdAt: new Date(),
      expiresAt: row.expiresAt,
    }));
  }

  async softDisable(input: { userId: EntityId; now: Date }): Promise<void> {
    await this.db
      .update(contactsIndex)
      .set({ disabledAt: input.now })
      .where(
        and(
          eq(contactsIndex.profileId, input.userId),
          isNull(contactsIndex.disabledAt),
        ),
      );
  }

  async purgeOlderThan(cutoff: Date): Promise<number> {
    const result = await this.db
      .delete(contactsIndex)
      .where(lt(contactsIndex.disabledAt, cutoff))
      .returning();
    return result.length;
  }
}

class DrizzleEmailIndexRepository implements EmailIndexRepository {
  constructor(private readonly db: HoneDb) {}

  async upsertHashes(input: {
    userId: EntityId;
    hashes: Array<{ hash: string; saltVersion: number; expiresAt: Date }>;
  }) {
    if (input.hashes.length === 0) return;
    await this.db
      .insert(emailIndex)
      .values(
        input.hashes.map((h) => ({
          profileId: input.userId,
          emailHash: h.hash,
          saltVersion: h.saltVersion,
          expiresAt: h.expiresAt,
        }))
      )
      .onConflictDoUpdate({
        target: [emailIndex.profileId, emailIndex.emailHash],
        set: {
          saltVersion: sql`excluded.salt_version`,
          expiresAt: sql`excluded.expires_at`,
        },
      });
  }

  async findMatches(input: { hashes: string[]; excludeUserId: EntityId }) {
    if (input.hashes.length === 0) return [];
    const now = new Date();
    const rows = await this.db
      .select({ profileId: emailIndex.profileId })
      .from(emailIndex)
      .where(
        and(
          inArray(emailIndex.emailHash, input.hashes),
          gt(emailIndex.expiresAt, now)
        )
      );
    return rows
      .map((r) => r.profileId)
      .filter((id) => id !== input.excludeUserId);
  }

  async deleteForUser(userId: EntityId) {
    await this.db
      .delete(emailIndex)
      .where(eq(emailIndex.profileId, userId));
  }

  async deleteExpired() {
    const now = new Date();
    await this.db
      .delete(emailIndex)
      .where(lt(emailIndex.expiresAt, now));
  }

  async expireBySaltVersion(saltVersion: number, expiresAt: Date): Promise<number> {
    const result = await this.db
      .update(emailIndex)
      .set({ expiresAt })
      .where(eq(emailIndex.saltVersion, saltVersion))
      .returning();
    return result.length;
  }

  async deleteByTargetHash(hashes: string[]): Promise<void> {
    if (hashes.length === 0) return;
    await this.db.delete(emailIndex).where(inArray(emailIndex.emailHash, hashes));
  }

  async listByUser(userId: EntityId): Promise<EmailIndex[]> {
    const rows = await this.db
      .select()
      .from(emailIndex)
      .where(eq(emailIndex.profileId, userId));
    return rows.map((row) => ({
      profileId: row.profileId,
      emailHash: row.emailHash,
      saltVersion: row.saltVersion,
      expiresAt: row.expiresAt,
    }));
  }
}

class DrizzleListRepository implements ListRepository {
  constructor(private readonly db: HoneDb) {}

  async create(input: Parameters<ListRepository["create"]>[0]) {
    const slug = input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const [row] = await this.db
      .insert(shelves)
      .values({
        id: input.id,
        ownerId: input.ownerId,
        name: input.title,
        slug,
        visibility: input.visibility,
        isSystem: false,
        kind: "list" as const,
        authorType: "user" as const,
        description: input.description ?? null,
      })
      .returning();
    if (!row) throw new Error("Failed to create list");
    return toList(row);
  }

  async findById(id: EntityId) {
    const row = await this.db.query.shelves.findFirst({
      where: and(eq(shelves.id, id), eq(shelves.kind, "list")),
    });
    return row ? toList(row) : null;
  }

  async listByOwner(ownerId: EntityId) {
    const rows = await this.db
      .select()
      .from(shelves)
      .where(and(eq(shelves.ownerId, ownerId), eq(shelves.kind, "list")))
      .orderBy(desc(shelves.createdAt));
    return rows.map(toList);
  }

  async update(input: Parameters<ListRepository["update"]>[0]) {
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (input.title !== undefined) updateData.name = input.title;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.visibility !== undefined) updateData.visibility = input.visibility;

    const [row] = await this.db
      .update(shelves)
      .set(updateData)
      .where(
        and(
          eq(shelves.id, input.id),
          eq(shelves.ownerId, input.ownerId),
          eq(shelves.kind, "list")
        )
      )
      .returning();
    if (!row) throw new Error("List not found");
    return toList(row);
  }

  async delete(input: { id: EntityId; ownerId: EntityId }) {
    await this.db
      .delete(shelves)
      .where(
        and(
          eq(shelves.id, input.id),
          eq(shelves.ownerId, input.ownerId),
          eq(shelves.kind, "list")
        )
      );
  }

  async addItem(input: { listId: EntityId; bookId: EntityId; position: number }) {
    const [row] = await this.db
      .insert(shelfItems)
      .values({
        shelfId: input.listId,
        bookId: input.bookId,
        position: input.position,
        status: "want_to_read",
      })
      .returning();
    if (!row) throw new Error("Failed to add item to list");
    return toListItem(row);
  }

  async removeItem(input: { listId: EntityId; bookId: EntityId }) {
    await this.db
      .delete(shelfItems)
      .where(
        and(
          eq(shelfItems.shelfId, input.listId),
          eq(shelfItems.bookId, input.bookId)
        )
      );
  }

  async listItems(listId: EntityId) {
    const rows = await this.db
      .select()
      .from(shelfItems)
      .where(eq(shelfItems.shelfId, listId))
      .orderBy(asc(shelfItems.position));
    return rows.map(toListItem);
  }

  async reorderItems(input: { listId: EntityId; orderedBookIds: EntityId[] }) {
    await Promise.all(
      input.orderedBookIds.map((bookId, index) =>
        this.db
          .update(shelfItems)
          .set({ position: index, updatedAt: new Date() })
          .where(
            and(
              eq(shelfItems.shelfId, input.listId),
              eq(shelfItems.bookId, bookId)
            )
          )
      )
    );
  }
}

class DrizzleAuthIdentityRepository implements AuthIdentityRepository {
  constructor(private readonly db: HoneDb) {}

  async create(input: Parameters<AuthIdentityRepository["create"]>[0]) {
    const [row] = await this.db
      .insert(authIdentities)
      .values({
        provider: input.provider,
        providerUserId: input.providerUserId,
        profileId: input.profileId
      })
      .onConflictDoNothing()
      .returning();
    if (!row) {
      const existing = await this.findByProvider({ provider: input.provider, providerUserId: input.providerUserId });
      if (!existing) throw new Error("Failed to create auth identity");
      return existing;
    }
    return toOAuthIdentity(row);
  }

  async findByProvider(input: { provider: string; providerUserId: string }) {
    const row = await this.db.query.authIdentities.findFirst({
      where: and(
        eq(authIdentities.provider, input.provider),
        eq(authIdentities.providerUserId, input.providerUserId)
      )
    });
    return row ? toOAuthIdentity(row) : null;
  }

  async listByProfile(profileId: EntityId) {
    const rows = await this.db
      .select()
      .from(authIdentities)
      .where(eq(authIdentities.profileId, profileId));
    return rows.map(toOAuthIdentity);
  }
}

class DrizzleSessionRepository implements SessionRepository {
  constructor(private readonly db: HoneDb) {}

  async create(input: Parameters<SessionRepository["create"]>[0]) {
    const [row] = await this.db
      .insert(sessions)
      .values({
        tokenHash: input.tokenHash,
        profileId: input.profileId,
        expiresAt: input.expiresAt
      })
      .returning();
    if (!row) throw new Error("Failed to create session");
    return toSession(row);
  }

  async findByTokenHash(tokenHash: string) {
    const row = await this.db.query.sessions.findFirst({
      where: eq(sessions.tokenHash, tokenHash)
    });
    return row ? toSession(row) : null;
  }

  async revokeByTokenHash(tokenHash: string) {
    await this.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.tokenHash, tokenHash));
  }

  async revokeAllForProfile(profileId: EntityId) {
    await this.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.profileId, profileId));
  }
}

class DrizzleHandleHistoryRepository implements HandleHistoryRepository {
  constructor(private readonly db: HoneDb) {}

  async record(input: Parameters<HandleHistoryRepository["record"]>[0]) {
    const [row] = await this.db
      .insert(handleHistory)
      .values({
        profileId: input.profileId,
        oldHandle: input.oldHandle,
        retiredAt: input.retiredAt,
        expiresAt: input.expiresAt
      })
      .returning();
    if (!row) throw new Error("Failed to record handle history");
    return toHandleHistory(row);
  }

  async findCurrentByOldHandle(oldHandle: string) {
    const now = new Date();
    const row = await this.db.query.handleHistory.findFirst({
      where: and(
        eq(handleHistory.oldHandle, oldHandle),
        gt(handleHistory.expiresAt, now)
      )
    });
    return row ? toHandleHistory(row) : null;
  }
}

export class DrizzleMagicLinkRepository implements MagicLinkRepository {
  constructor(private readonly db: HoneDb) {}

  async create(input: { email: string; tokenHash: string; expiresAt: Date }) {
    const [row] = await this.db
      .insert(magicLinkTokens)
      .values({
        tokenHash: input.tokenHash,
        email: input.email,
        expiresAt: input.expiresAt
      })
      .returning();
    if (!row) throw new Error("Failed to create magic link token");
    return toMagicLinkToken(row);
  }

  async findByTokenHash(tokenHash: string) {
    const row = await this.db.query.magicLinkTokens.findFirst({
      where: eq(magicLinkTokens.tokenHash, tokenHash)
    });
    return row ? toMagicLinkToken(row) : null;
  }

  async markConsumed(tokenHash: string) {
    await this.db
      .update(magicLinkTokens)
      .set({ consumedAt: new Date() })
      .where(eq(magicLinkTokens.tokenHash, tokenHash));
  }

  async deleteExpiredForEmail(email: string) {
    const now = new Date();
    await this.db
      .delete(magicLinkTokens)
      .where(
        and(
          eq(magicLinkTokens.email, email),
          lt(magicLinkTokens.expiresAt, now)
        )
      );
  }
}


class DrizzleInAppNotificationRepository implements InAppNotificationRepository {
  constructor(private readonly db: HoneDb) {}

  async list(input: {
    recipientId: EntityId;
    cursor?: string;
    limit: number;
  }) {
    const conditions = [eq(inAppNotifications.recipientId, input.recipientId)];

    if (input.cursor) {
      const cursorRow = await this.db.query.inAppNotifications.findFirst({
        where: eq(inAppNotifications.id, input.cursor),
      });
      if (cursorRow) {
        conditions.push(lt(inAppNotifications.createdAt, cursorRow.createdAt));
      }
    }

    const rows = await this.db
      .select()
      .from(inAppNotifications)
      .where(and(...conditions))
      .orderBy(desc(inAppNotifications.createdAt))
      .limit(input.limit);

    return rows.map(toInAppNotification);
  }

  async markRead(input: {
    recipientId: EntityId;
    notificationId: EntityId;
  }) {
    await this.db
      .update(inAppNotifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(inAppNotifications.id, input.notificationId),
          eq(inAppNotifications.recipientId, input.recipientId),
          sql`${inAppNotifications.readAt} IS NULL`
        )
      );
  }

  async findById(id: EntityId) {
    const row = await this.db.query.inAppNotifications.findFirst({
      where: eq(inAppNotifications.id, id),
    });
    return row ? toInAppNotification(row) : null;
  }

  async create(input: {
    recipientId: EntityId;
    actorId?: EntityId | undefined;
    trigger: NotificationTrigger;
    payload: Record<string, unknown>;
  }): Promise<InAppNotification> {
    const [row] = await this.db
      .insert(inAppNotifications)
      .values({
        recipientId: input.recipientId,
        actorId: input.actorId ?? null,
        trigger: input.trigger,
        payload: input.payload,
      })
      .returning();
    if (!row) {
      throw new Error("Failed to create in-app notification");
    }
    return toInAppNotification(row);
  }

  async countSince(input: { recipientId: EntityId; since: Date }) {
    const rows = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(inAppNotifications)
      .where(
        and(
          eq(inAppNotifications.recipientId, input.recipientId),
          gte(inAppNotifications.createdAt, input.since),
        ),
      );
    return rows[0]?.count ?? 0;
  }

  async countSinceByActor(input: {
    recipientId: EntityId;
    actorId: EntityId;
    since: Date;
  }) {
    const rows = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(inAppNotifications)
      .where(
        and(
          eq(inAppNotifications.recipientId, input.recipientId),
          eq(inAppNotifications.actorId, input.actorId),
          gte(inAppNotifications.createdAt, input.since),
        ),
      );
    return rows[0]?.count ?? 0;
  }

  async listAllByRecipient(recipientId: EntityId) {
    const rows = await this.db
      .select()
      .from(inAppNotifications)
      .where(eq(inAppNotifications.recipientId, recipientId))
      .orderBy(desc(inAppNotifications.createdAt));
    return rows.map(toInAppNotification);
  }
}

export class DrizzlePhoneVerificationRepository implements PhoneVerificationRepository {
  constructor(private readonly db: HoneDb) {}

  async upsert(input: {
    phoneE164: string;
    codeHash: string;
    attempts: number;
    expiresAt: Date;
  }) {
    const [row] = await this.db
      .insert(phoneVerifications)
      .values({
        phoneE164: input.phoneE164,
        codeHash: input.codeHash,
        attempts: input.attempts,
        expiresAt: input.expiresAt,
      })
      .onConflictDoUpdate({
        target: [phoneVerifications.phoneE164],
        set: {
          codeHash: input.codeHash,
          attempts: input.attempts,
          expiresAt: input.expiresAt,
        },
      })
      .returning();
    if (!row) throw new Error("Failed to upsert phone verification");
    return toPhoneVerification(row);
  }

  async findByPhone(phoneE164: string) {
    const row = await this.db.query.phoneVerifications.findFirst({
      where: eq(phoneVerifications.phoneE164, phoneE164),
    });
    return row ? toPhoneVerification(row) : null;
  }

  async incrementAttempts(phoneE164: string) {
    const [row] = await this.db
      .update(phoneVerifications)
      .set({ attempts: sql`${phoneVerifications.attempts} + 1` })
      .where(eq(phoneVerifications.phoneE164, phoneE164))
      .returning();
    if (!row) throw new Error("Phone verification not found");
    return toPhoneVerification(row);
  }

  async deleteByPhone(phoneE164: string) {
    await this.db
      .delete(phoneVerifications)
      .where(eq(phoneVerifications.phoneE164, phoneE164));
  }

  async deleteExpired() {
    const now = new Date();
    await this.db
      .delete(phoneVerifications)
      .where(lt(phoneVerifications.expiresAt, now));
  }
}

export class DrizzlePhoneNumberRepository implements PhoneNumberRepository {
  constructor(private readonly db: HoneDb) {}

  async upsert(input: { profileId: EntityId; e164Hash: string }) {
    const [row] = await this.db
      .insert(phoneNumbers)
      .values({
        profileId: input.profileId,
        e164Hash: input.e164Hash,
      })
      .onConflictDoUpdate({
        target: [phoneNumbers.profileId],
        set: { e164Hash: input.e164Hash },
      })
      .returning();
    if (!row) throw new Error("Failed to upsert phone number");
    return toPhoneNumber(row);
  }

  async findByProfileId(profileId: EntityId) {
    const row = await this.db.query.phoneNumbers.findFirst({
      where: eq(phoneNumbers.profileId, profileId),
    });
    return row ? toPhoneNumber(row) : null;
  }

  async findByHash(e164Hash: string) {
    const row = await this.db.query.phoneNumbers.findFirst({
      where: eq(phoneNumbers.e164Hash, e164Hash),
    });
    return row ? toPhoneNumber(row) : null;
  }
}

class DrizzleSaltRepository implements SaltRepository {
  constructor(private readonly db: HoneDb) {}

  async create(input: {
    version: number;
    keyMaterial: string;
    activeFrom: Date;
    activeTo?: Date | undefined;
  }): Promise<Salt> {
    const [row] = await this.db
      .insert(salts)
      .values({
        version: input.version,
        keyMaterial: input.keyMaterial,
        activeFrom: input.activeFrom,
        activeTo: input.activeTo ?? null,
      })
      .returning();
    if (!row) throw new Error("Failed to create salt");
    return toSalt(row);
  }

  async findActive(): Promise<Salt | null> {
    const now = new Date();
    const row = await this.db.query.salts.findFirst({
      where: and(
        lte(salts.activeFrom, now),
        or(isNull(salts.activeTo), gt(salts.activeTo, now))
      ),
      orderBy: [desc(salts.version)],
    });
    return row ? toSalt(row) : null;
  }

  async findByVersion(version: number): Promise<Salt | null> {
    const row = await this.db.query.salts.findFirst({
      where: eq(salts.version, version),
    });
    return row ? toSalt(row) : null;
  }

  async retire(input: { version: number; activeTo: Date }): Promise<Salt> {
    const [row] = await this.db
      .update(salts)
      .set({ activeTo: input.activeTo })
      .where(eq(salts.version, input.version))
      .returning();
    if (!row) throw new Error("Salt not found");
    return toSalt(row);
  }

  async getLatestVersion(): Promise<number> {
    const row = await this.db.query.salts.findFirst({
      orderBy: [desc(salts.version)],
    });
    return row ? row.version : 0;
  }

  async listAll(): Promise<Salt[]> {
    const rows = await this.db
      .select()
      .from(salts)
      .orderBy(desc(salts.version));
    return rows.map(toSalt);
  }
}

export function createDrizzleRepositories(db: HoneDb): AppRepositories {
  return {
    accountDeletions: new DrizzleAccountDeletionRepository(db),
    profiles: new DrizzleProfileRepository(db),
    books: new DrizzleBookRepository(db),
    shelves: new DrizzleShelfRepository(db),
    reviews: new DrizzleReviewRepository(db),
    activity: new DrizzleActivityRepository(db),
    recommendations: new DrizzleRecommendationRepository(db),
    follows: new DrizzleFollowRepository(db),
    blocks: new DrizzleBlockRepository(db),
    rankings: new DrizzleRankingRepository(db),
    notifications: new DrizzleNotificationRepository(db),
    imports: new DrizzleImportRepository(db),
    contacts: new DrizzleContactsRepository(db),
    emailIndex: new DrizzleEmailIndexRepository(db),
    lists: new DrizzleListRepository(db),
    authIdentities: new DrizzleAuthIdentityRepository(db),
    sessions: new DrizzleSessionRepository(db),
    handleHistory: new DrizzleHandleHistoryRepository(db),
    magicLinks: new DrizzleMagicLinkRepository(db),
    inAppNotifications: new DrizzleInAppNotificationRepository(db),
    phoneVerifications: new DrizzlePhoneVerificationRepository(db),
    phoneNumbers: new DrizzlePhoneNumberRepository(db),
    salts: new DrizzleSaltRepository(db),
  };
}
