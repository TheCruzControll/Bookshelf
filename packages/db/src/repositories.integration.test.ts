import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { POSTURE_C_DEFAULTS } from "@hone/domain";
import { createDrizzleRepositories } from "./repositories";
import { startPostgresContainer, createMigratedDb } from "./test-helpers";
import type { StartedPostgresContainer, MigratedDb } from "./test-helpers";

const DOCKER_AVAILABLE = await (async () => {
  try {
    const { execSync } = await import("child_process");
    execSync("docker info", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

function uid(suffix: string) {
  return `00000000-0000-0000-0000-${suffix.padStart(12, "0")}`;
}

const describeIntegration = DOCKER_AVAILABLE ? describe : describe.skip;

describeIntegration("repository integration tests (real Postgres)", () => {
  let container: StartedPostgresContainer;
  let db: MigratedDb;
  let repos: ReturnType<typeof createDrizzleRepositories>;

  beforeAll(async () => {
    container = await startPostgresContainer();
    db = await createMigratedDb(container.connectionString);
    repos = createDrizzleRepositories(db);
  }, 90_000);

  afterAll(async () => {
    await db.endPool();
    await container.stop();
  });

  describe("DrizzleProfileRepository", () => {
    it("happy: create and findById returns the profile", async () => {
      const id = uid("100000000001");
      const profile = await repos.profiles.create({
        id,
        handle: "alice",
        displayName: "Alice",
        defaultVisibility: POSTURE_C_DEFAULTS,
      });
      expect(profile.id).toBe(id);
      expect(profile.handle).toBe("alice");

      const found = await repos.profiles.findById(id);
      expect(found).not.toBeNull();
      expect(found!.handle).toBe("alice");
    });

    it("happy: findByHandle returns the correct profile", async () => {
      const id = uid("100000000002");
      await repos.profiles.create({
        id,
        handle: "bob",
        displayName: "Bob",
        defaultVisibility: POSTURE_C_DEFAULTS,
      });
      const found = await repos.profiles.findByHandle("bob");
      expect(found).not.toBeNull();
      expect(found!.id).toBe(id);
    });

    it("happy: isHandleTaken returns true for existing handle", async () => {
      const taken = await repos.profiles.isHandleTaken("alice");
      expect(taken).toBe(true);
    });

    it("failure: findById returns null for unknown id", async () => {
      const result = await repos.profiles.findById(uid("999999999999"));
      expect(result).toBeNull();
    });

    it("failure: findByHandle returns null for unknown handle", async () => {
      const result = await repos.profiles.findByHandle("nobody");
      expect(result).toBeNull();
    });

    it("failure: setHandle throws when profile not found", async () => {
      await expect(
        repos.profiles.setHandle({ userId: uid("999999999998"), handle: "ghost" })
      ).rejects.toThrow();
    });
  });

  describe("DrizzleBookRepository", () => {
    it("happy: findEditionByIsbn returns edition by isbn13", async () => {
      const bookId = uid("200000000001");
      await db.execute(
        `INSERT INTO books (id, canonical_title, created_at, updated_at) VALUES ('${bookId}', 'Test Book', now(), now())`
      );
      const editionId = uid("200000000002");
      await db.execute(
        `INSERT INTO editions (id, book_id, isbn_13, title, source) VALUES ('${editionId}', '${bookId}', '9780441013593', 'Test Book', 'openlibrary')`
      );

      const edition = await repos.books.findEditionByIsbn("9780441013593");
      expect(edition).not.toBeNull();
      expect(edition!.id).toBe(editionId);
    });

    it("happy: search returns books matching title", async () => {
      const results = await repos.books.search("Test Book", 10);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.canonicalTitle).toContain("Test Book");
    });

    it("failure: findBookById returns null for unknown id", async () => {
      const result = await repos.books.findBookById(uid("999999999990"));
      expect(result).toBeNull();
    });

    it("failure: findEditionByIsbn returns null for unknown isbn", async () => {
      const result = await repos.books.findEditionByIsbn("0000000000000");
      expect(result).toBeNull();
    });

    it("happy: findBookByIsbn13 returns the book joined via editions", async () => {
      const bookId = uid("200000000003");
      await db.execute(
        `INSERT INTO books (id, canonical_title, created_at, updated_at) VALUES ('${bookId}', 'Joined Book', now(), now())`
      );
      const editionId = uid("200000000004");
      await db.execute(
        `INSERT INTO editions (id, book_id, isbn_13, title, source) VALUES ('${editionId}', '${bookId}', '9780000000001', 'Joined Book', 'open_library')`
      );

      const book = await repos.books.findBookByIsbn13("9780000000001");
      expect(book).not.toBeNull();
      expect(book!.id).toBe(bookId);
    });

    it("failure: findBookByIsbn13 returns null for unknown isbn", async () => {
      const result = await repos.books.findBookByIsbn13("9999999999999");
      expect(result).toBeNull();
    });

    describe("upsertFromCatalogResult — edition merge (#72)", () => {
      it("creates a new Book + Edition on first ingest", async () => {
        const outcome = await repos.books.upsertFromCatalogResult({
          source: "open_library",
          sourceKey: "/works/MERGE_TEST_1",
          title: "Merge Test One",
          authors: ["Author One"],
          isbn13: "9780000000010",
          workId: "MERGE_TEST_1",
        });

        expect(outcome.bookCreated).toBe(true);
        expect(outcome.editionCreated).toBe(true);
        expect(outcome.workIdBackfilled).toBe(false);
        expect(outcome.book.olWorkId).toBe("MERGE_TEST_1");
        expect(outcome.edition.bookId).toBe(outcome.book.id);
        expect(outcome.edition.isbn13).toBe("9780000000010");
      });

      it("same ISBN-13 across OL + GB → one Book, two Editions", async () => {
        const isbn13 = "9780000000020";

        const olOutcome = await repos.books.upsertFromCatalogResult({
          source: "open_library",
          sourceKey: "/works/MERGE_TEST_2",
          title: "Merge Test Two (OL)",
          authors: ["Author Two"],
          isbn13,
          workId: "MERGE_TEST_2",
        });

        const gbOutcome = await repos.books.upsertFromCatalogResult({
          source: "google_books",
          sourceKey: "GB_MERGE_TEST_2",
          title: "Merge Test Two (GB)",
          authors: ["Author Two"],
          isbn13,
        });

        expect(olOutcome.bookCreated).toBe(true);
        expect(gbOutcome.bookCreated).toBe(false);
        expect(gbOutcome.editionCreated).toBe(true);
        // Both editions attach to the same Book row.
        expect(gbOutcome.book.id).toBe(olOutcome.book.id);
        // OL work id remains intact.
        expect(gbOutcome.book.olWorkId).toBe("MERGE_TEST_2");
      });

      it("GB first then OL — workId is back-filled on the existing Book", async () => {
        const isbn13 = "9780000000030";

        const gbOutcome = await repos.books.upsertFromCatalogResult({
          source: "google_books",
          sourceKey: "GB_MERGE_TEST_3",
          title: "Merge Test Three (GB)",
          authors: ["Author Three"],
          isbn13,
        });
        expect(gbOutcome.book.olWorkId).toBeUndefined();

        const olOutcome = await repos.books.upsertFromCatalogResult({
          source: "open_library",
          sourceKey: "/works/MERGE_TEST_3",
          title: "Merge Test Three (OL)",
          authors: ["Author Three"],
          isbn13,
          workId: "MERGE_TEST_3",
        });

        expect(olOutcome.bookCreated).toBe(false);
        expect(olOutcome.workIdBackfilled).toBe(true);
        expect(olOutcome.book.id).toBe(gbOutcome.book.id);
        expect(olOutcome.book.olWorkId).toBe("MERGE_TEST_3");
      });

      it("OL twice with same sourceKey — idempotent, no duplicate Edition", async () => {
        const result = {
          source: "open_library" as const,
          sourceKey: "/works/MERGE_TEST_4",
          title: "Merge Test Four",
          authors: ["Author Four"],
          isbn13: "9780000000040",
          workId: "MERGE_TEST_4",
        };

        const first = await repos.books.upsertFromCatalogResult(result);
        const second = await repos.books.upsertFromCatalogResult(result);

        expect(first.bookCreated).toBe(true);
        expect(first.editionCreated).toBe(true);
        expect(second.bookCreated).toBe(false);
        expect(second.editionCreated).toBe(false);
        expect(second.book.id).toBe(first.book.id);
        expect(second.edition.id).toBe(first.edition.id);
      });
    });
  });

  describe("DrizzleShelfRepository", () => {
    const ownerId = uid("300000000001");

    beforeAll(async () => {
      await repos.profiles.create({
        id: ownerId,
        handle: "shelf-owner",
        displayName: "Shelf Owner",
        defaultVisibility: POSTURE_C_DEFAULTS,
      });
    });

    it("happy: create and findById returns the shelf", async () => {
      const shelf = await repos.shelves.create({
        ownerId,
        name: "My Reads",
        slug: "my-reads",
        visibility: "public",
      });
      expect(shelf.name).toBe("My Reads");
      expect(shelf.ownerId).toBe(ownerId);

      const found = await repos.shelves.findById(shelf.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(shelf.id);
    });

    it("happy: update increments version and changes name", async () => {
      const shelf = await repos.shelves.create({
        ownerId,
        name: "Before Update",
        slug: "before-update",
        visibility: "public",
      });
      const updated = await repos.shelves.update({
        id: shelf.id,
        ownerId,
        version: shelf.version,
        name: "After Update",
      });
      expect(updated.name).toBe("After Update");
      expect(updated.version).toBe(shelf.version + 1);
    });

    it("happy: createSystemShelves seeds four system shelves", async () => {
      const systemShelves = await repos.shelves.createSystemShelves(ownerId);
      expect(systemShelves.length).toBe(4);
      const slugs = systemShelves.map((s) => s.slug);
      expect(slugs).toContain("reading");
      expect(slugs).toContain("want-to-read");
      expect(slugs).toContain("finished");
      expect(slugs).toContain("dropped");
    });

    it("happy: createSystemShelves is idempotent", async () => {
      const first = await repos.shelves.createSystemShelves(ownerId);
      const second = await repos.shelves.createSystemShelves(ownerId);
      expect(second.length).toBe(first.length);
    });

    it("failure: update with stale version throws", async () => {
      const shelf = await repos.shelves.create({
        ownerId,
        name: "Version Test",
        slug: "version-test",
        visibility: "public",
      });
      await repos.shelves.update({
        id: shelf.id,
        ownerId,
        version: shelf.version,
        name: "First Update",
      });
      await expect(
        repos.shelves.update({
          id: shelf.id,
          ownerId,
          version: shelf.version,
          name: "Stale Update",
        })
      ).rejects.toThrow();
    });

    it("failure: findById returns null for unknown shelf", async () => {
      const result = await repos.shelves.findById(uid("999999999980"));
      expect(result).toBeNull();
    });
  });

  describe("DrizzleReviewRepository", () => {
    const authorId = uid("400000000001");
    const bookId = uid("400000000002");

    beforeAll(async () => {
      await repos.profiles.create({
        id: authorId,
        handle: "reviewer",
        displayName: "Reviewer",
        defaultVisibility: POSTURE_C_DEFAULTS,
      });
      await db.execute(
        `INSERT INTO books (id, canonical_title, created_at, updated_at) VALUES ('${bookId}', 'Review Book', now(), now())`
      );
    });

    it("happy: create and update a review", async () => {
      const review = await repos.reviews.create({
        authorId,
        bookId,
        body: "Great book!",
        visibility: "public",
      });
      expect(review.body).toBe("Great book!");
      expect(review.version).toBe(1);

      const updated = await repos.reviews.update({
        id: review.id,
        authorId,
        version: review.version,
        body: "Excellent book!",
      });
      expect(updated.body).toBe("Excellent book!");
      expect(updated.version).toBe(2);
    });

    it("failure: update with stale version throws", async () => {
      const review = await repos.reviews.create({
        authorId,
        bookId,
        body: "Original",
        visibility: "public",
      });
      await repos.reviews.update({
        id: review.id,
        authorId,
        version: review.version,
        body: "First edit",
      });
      await expect(
        repos.reviews.update({
          id: review.id,
          authorId,
          version: review.version,
          body: "Stale edit",
        })
      ).rejects.toThrow();
    });
  });

  describe("DrizzleFollowRepository", () => {
    const userA = uid("500000000001");
    const userB = uid("500000000002");
    const userC = uid("500000000003");

    beforeAll(async () => {
      await Promise.all([
        repos.profiles.create({ id: userA, handle: "follow-a", displayName: "A", defaultVisibility: POSTURE_C_DEFAULTS }),
        repos.profiles.create({ id: userB, handle: "follow-b", displayName: "B", defaultVisibility: POSTURE_C_DEFAULTS }),
        repos.profiles.create({ id: userC, handle: "follow-c", displayName: "C", defaultVisibility: POSTURE_C_DEFAULTS }),
      ]);
    });

    it("happy: follow and findFollow returns the relationship", async () => {
      await repos.follows.follow({ followerId: userA, followeeId: userB });
      const found = await repos.follows.findFollow({ followerId: userA, followeeId: userB });
      expect(found).not.toBeNull();
      expect(found!.followerId).toBe(userA);
      expect(found!.followeeId).toBe(userB);
    });

    it("happy: follow is idempotent", async () => {
      await repos.follows.follow({ followerId: userA, followeeId: userB });
      const result = await repos.follows.follow({ followerId: userA, followeeId: userB });
      expect(result.followerId).toBe(userA);
    });

    it("happy: isMutual returns true when both follow each other", async () => {
      await repos.follows.follow({ followerId: userB, followeeId: userA });
      const mutual = await repos.follows.isMutual({ userA, userB });
      expect(mutual).toBe(true);
    });

    it("happy: isMutual returns false for one-way follow", async () => {
      await repos.follows.follow({ followerId: userA, followeeId: userC });
      const mutual = await repos.follows.isMutual({ userA, userB: userC });
      expect(mutual).toBe(false);
    });

    it("happy: listFollowers returns correct list", async () => {
      const followers = await repos.follows.listFollowers(userB);
      const ids = followers.map((f) => f.followerId);
      expect(ids).toContain(userA);
    });

    it("happy: unfollow removes the relationship", async () => {
      await repos.follows.unfollow({ followerId: userA, followeeId: userC });
      const found = await repos.follows.findFollow({ followerId: userA, followeeId: userC });
      expect(found).toBeNull();
    });

    it("failure: findFollow returns null for non-existent relationship", async () => {
      const result = await repos.follows.findFollow({ followerId: userC, followeeId: userA });
      expect(result).toBeNull();
    });
  });

  describe("DrizzleBlockRepository", () => {
    const blocker = uid("600000000001");
    const blocked = uid("600000000002");

    beforeAll(async () => {
      await Promise.all([
        repos.profiles.create({ id: blocker, handle: "blocker", displayName: "Blocker", defaultVisibility: POSTURE_C_DEFAULTS }),
        repos.profiles.create({ id: blocked, handle: "blocked", displayName: "Blocked", defaultVisibility: POSTURE_C_DEFAULTS }),
      ]);
    });

    it("happy: block and isBlocked returns true", async () => {
      await repos.blocks.block({ blockerId: blocker, blockedId: blocked });
      const result = await repos.blocks.isBlocked({ viewerId: blocker, targetId: blocked });
      expect(result).toBe(true);
    });

    it("happy: block is idempotent", async () => {
      const b = await repos.blocks.block({ blockerId: blocker, blockedId: blocked });
      expect(b.blockerId).toBe(blocker);
    });

    it("happy: isBlocked is symmetric", async () => {
      const result = await repos.blocks.isBlocked({ viewerId: blocked, targetId: blocker });
      expect(result).toBe(true);
    });

    it("happy: listBlockedByUser returns blocked users", async () => {
      const list = await repos.blocks.listBlockedByUser(blocker);
      const ids = list.map((b) => b.blockedId);
      expect(ids).toContain(blocked);
    });

    it("happy: unblock removes block", async () => {
      await repos.blocks.unblock({ blockerId: blocker, blockedId: blocked });
      const result = await repos.blocks.isBlocked({ viewerId: blocker, targetId: blocked });
      expect(result).toBe(false);
    });

    it("failure: findBlock returns null when no block exists", async () => {
      const result = await repos.blocks.findBlock({ blockerId: blocker, blockedId: blocked });
      expect(result).toBeNull();
    });
  });

  describe("DrizzleRankingRepository", () => {
    const rankOwnerId = uid("700000000001");
    const rankBookId = uid("700000000002");

    beforeAll(async () => {
      await repos.profiles.create({ id: rankOwnerId, handle: "ranker", displayName: "Ranker", defaultVisibility: POSTURE_C_DEFAULTS });
      await db.execute(
        `INSERT INTO books (id, canonical_title, created_at, updated_at) VALUES ('${rankBookId}', 'Rank Book', now(), now())`
      );
    });

    it("happy: upsert creates a ranking and findByOwnerAndBook returns it", async () => {
      const ranking = await repos.rankings.upsert({
        ownerId: rankOwnerId,
        bookId: rankBookId,
        rank: 1,
        score: 9.5,
      });
      expect(ranking.position).toBe(1);
      expect(ranking.score).toBeCloseTo(9.5);

      const found = await repos.rankings.findByOwnerAndBook({ ownerId: rankOwnerId, bookId: rankBookId });
      expect(found).not.toBeNull();
      expect(found!.id).toBe(ranking.id);
    });

    it("happy: upsert updates existing ranking", async () => {
      const updated = await repos.rankings.upsert({
        ownerId: rankOwnerId,
        bookId: rankBookId,
        rank: 2,
        score: 8.0,
      });
      expect(updated.position).toBe(2);
      expect(updated.score).toBeCloseTo(8.0);
    });

    it("happy: listByOwner returns rankings ordered by position", async () => {
      const list = await repos.rankings.listByOwner(rankOwnerId);
      expect(list.length).toBeGreaterThan(0);
      expect(list[0]!.profileId).toBe(rankOwnerId);
    });

    it("failure: findById returns null for unknown ranking", async () => {
      const result = await repos.rankings.findById(uid("999999999970"));
      expect(result).toBeNull();
    });

    it("failure: findByOwnerAndBook returns null when not ranked", async () => {
      const result = await repos.rankings.findByOwnerAndBook({
        ownerId: rankOwnerId,
        bookId: uid("999999999969"),
      });
      expect(result).toBeNull();
    });
  });

  describe("DrizzleImportRepository", () => {
    const importOwnerId = uid("800000000001");

    beforeAll(async () => {
      await repos.profiles.create({ id: importOwnerId, handle: "importer", displayName: "Importer", defaultVisibility: POSTURE_C_DEFAULTS });
    });

    it("happy: create and findById returns the import", async () => {
      const imp = await repos.imports.create({
        id: uid("800000000002"),
        ownerId: importOwnerId,
        source: "goodreads",
        idempotencyHash: "abc123",
      });
      expect(imp.source).toBe("goodreads");
      expect(imp.status).toBe("pending");

      const found = await repos.imports.findById(imp.id);
      expect(found).not.toBeNull();
      expect(found!.idempotencyHash).toBe("abc123");
    });

    it("happy: findByOwnerAndHash returns import by hash", async () => {
      const found = await repos.imports.findByOwnerAndHash({ ownerId: importOwnerId, hash: "abc123" });
      expect(found).not.toBeNull();
      expect(found!.ownerId).toBe(importOwnerId);
    });

    it("happy: updateStatus changes import status", async () => {
      const id = uid("800000000003");
      await repos.imports.create({ id, ownerId: importOwnerId, source: "goodreads" });
      const updated = await repos.imports.updateStatus({ id, status: "completed", completedAt: new Date() });
      expect(updated.status).toBe("completed");
      expect(updated.completedAt).toBeDefined();
    });

    it("failure: findById returns null for unknown import", async () => {
      const result = await repos.imports.findById(uid("999999999960"));
      expect(result).toBeNull();
    });

    it("failure: findByOwnerAndHash returns null for unknown hash", async () => {
      const result = await repos.imports.findByOwnerAndHash({ ownerId: importOwnerId, hash: "nosuchhash" });
      expect(result).toBeNull();
    });
  });

  describe("DrizzleContactsRepository", () => {
    const contactsUserId = uid("900000000001");

    beforeAll(async () => {
      await repos.profiles.create({ id: contactsUserId, handle: "contacts-user", displayName: "Contacts User", defaultVisibility: POSTURE_C_DEFAULTS });
    });

    it("happy: upsertHashes and findMatches returns matching users", async () => {
      const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
      await repos.contacts.upsertHashes({
        userId: contactsUserId,
        hashes: [{ hash: "hash-abc", saltVersion: 1, expiresAt }],
      });

      const matches = await repos.contacts.findMatches({
        hashes: ["hash-abc"],
        excludeUserId: uid("999999999950"),
      });
      expect(matches).toContain(contactsUserId);
    });

    it("happy: findMatches excludes the requesting user", async () => {
      const matches = await repos.contacts.findMatches({
        hashes: ["hash-abc"],
        excludeUserId: contactsUserId,
      });
      expect(matches).not.toContain(contactsUserId);
    });

    it("happy: deleteForUser removes all hashes for that user", async () => {
      await repos.contacts.deleteForUser(contactsUserId);
      const matches = await repos.contacts.findMatches({
        hashes: ["hash-abc"],
        excludeUserId: uid("999999999950"),
      });
      expect(matches).not.toContain(contactsUserId);
    });

    it("failure: findMatches with empty hashes returns empty array", async () => {
      const result = await repos.contacts.findMatches({ hashes: [], excludeUserId: contactsUserId });
      expect(result).toHaveLength(0);
    });

    it("happy: findMatchingProfilesByPhone joins against phone_numbers and skips expired/self", async () => {
      const viewerId = uid("90000000aa01");
      const matchedId = uid("90000000aa02");
      const expiredId = uid("90000000aa03");
      await repos.profiles.create({ id: viewerId, handle: "match-viewer", displayName: "MV", defaultVisibility: POSTURE_C_DEFAULTS });
      await repos.profiles.create({ id: matchedId, handle: "match-target", displayName: "MT", defaultVisibility: POSTURE_C_DEFAULTS });
      await repos.profiles.create({ id: expiredId, handle: "match-expired", displayName: "ME", defaultVisibility: POSTURE_C_DEFAULTS });
      await repos.phoneNumbers.upsert({ profileId: matchedId, e164Hash: "phonehash-live" });
      await repos.phoneNumbers.upsert({ profileId: expiredId, e164Hash: "phonehash-stale" });
      const live = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
      const stale = new Date(Date.now() - 60_000);
      await repos.contacts.upsertHashes({
        userId: viewerId,
        hashes: [
          { hash: "phonehash-live", saltVersion: 1, expiresAt: live },
          { hash: "phonehash-stale", saltVersion: 1, expiresAt: stale },
        ],
      });
      const matches = await repos.contacts.findMatchingProfilesByPhone(viewerId);
      expect(matches).toContain(matchedId);
      expect(matches).not.toContain(expiredId);
      expect(matches).not.toContain(viewerId);
    });

    it("happy: softDisable stamps disabledAt and excludes rows from match queries", async () => {
      const viewerId = uid("90000000ab01");
      const matchedId = uid("90000000ab02");
      await repos.profiles.create({ id: viewerId, handle: "disable-viewer", displayName: "DV", defaultVisibility: POSTURE_C_DEFAULTS });
      await repos.profiles.create({ id: matchedId, handle: "disable-target", displayName: "DT", defaultVisibility: POSTURE_C_DEFAULTS });
      await repos.phoneNumbers.upsert({ profileId: matchedId, e164Hash: "phonehash-disable" });
      const live = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
      await repos.contacts.upsertHashes({
        userId: viewerId,
        hashes: [{ hash: "phonehash-disable", saltVersion: 1, expiresAt: live }],
      });

      // Pre-condition: match is visible.
      const before = await repos.contacts.findMatchingProfilesByPhone(viewerId);
      expect(before).toContain(matchedId);

      // Soft-disable.
      await repos.contacts.softDisable({ userId: viewerId, now: new Date() });

      // Match queries immediately ignore disabled rows.
      const after = await repos.contacts.findMatchingProfilesByPhone(viewerId);
      expect(after).not.toContain(matchedId);
      const findMatches = await repos.contacts.findMatches({
        hashes: ["phonehash-disable"],
        excludeUserId: uid("999999999951"),
      });
      expect(findMatches).not.toContain(viewerId);
    });

    it("happy: purgeOlderThan only deletes rows whose disabledAt is older than the cutoff", async () => {
      const userId = uid("90000000ac01");
      await repos.profiles.create({ id: userId, handle: "purge-user", displayName: "PU", defaultVisibility: POSTURE_C_DEFAULTS });
      const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

      // Insert the "old" disabled row first, then stamp it 25h ago.
      await repos.contacts.upsertHashes({
        userId,
        hashes: [{ hash: "purge-old", saltVersion: 1, expiresAt }],
      });
      const old = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25h ago
      await repos.contacts.softDisable({ userId, now: old });

      // Insert the "fresh" disabled row second. softDisable's
      // `disabledAt IS NULL` filter means only this new row receives the
      // newer timestamp.
      await repos.contacts.upsertHashes({
        userId,
        hashes: [{ hash: "purge-fresh", saltVersion: 1, expiresAt }],
      });
      const fresh = new Date(Date.now() - 60 * 60 * 1000); // 1h ago
      await repos.contacts.softDisable({ userId, now: fresh });

      // Also insert an "active" row that never gets disabled.
      await repos.contacts.upsertHashes({
        userId,
        hashes: [{ hash: "purge-active", saltVersion: 1, expiresAt }],
      });

      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24h ago
      const purged = await repos.contacts.purgeOlderThan(cutoff);
      expect(purged).toBe(1);

      const remaining = await repos.contacts.listByUser(userId);
      const remainingHashes = remaining.map((r) => r.hash).sort();
      expect(remainingHashes).toEqual(["purge-active", "purge-fresh"]);
    });
  });

  describe("DrizzleAuthIdentityRepository", () => {
    const authProfileId = uid("a00000000001");

    beforeAll(async () => {
      await repos.profiles.create({ id: authProfileId, handle: "auth-user", displayName: "Auth User", defaultVisibility: POSTURE_C_DEFAULTS });
    });

    it("happy: create and findByProvider returns the identity", async () => {
      await repos.authIdentities.create({
        provider: "apple",
        providerUserId: "apple-sub-001",
        profileId: authProfileId,
      });
      const found = await repos.authIdentities.findByProvider({ provider: "apple", providerUserId: "apple-sub-001" });
      expect(found).not.toBeNull();
      expect(found!.profileId).toBe(authProfileId);
    });

    it("happy: create is idempotent on conflict", async () => {
      const result = await repos.authIdentities.create({
        provider: "apple",
        providerUserId: "apple-sub-001",
        profileId: authProfileId,
      });
      expect(result.profileId).toBe(authProfileId);
    });

    it("happy: listByProfile returns all identities for the profile", async () => {
      await repos.authIdentities.create({
        provider: "google",
        providerUserId: "google-sub-001",
        profileId: authProfileId,
      });
      const list = await repos.authIdentities.listByProfile(authProfileId);
      const providers = list.map((i) => i.provider);
      expect(providers).toContain("apple");
      expect(providers).toContain("google");
    });

    it("failure: findByProvider returns null for unknown identity", async () => {
      const result = await repos.authIdentities.findByProvider({ provider: "apple", providerUserId: "no-such-sub" });
      expect(result).toBeNull();
    });
  });

  describe("DrizzleSessionRepository", () => {
    const sessionProfileId = uid("b00000000001");

    beforeAll(async () => {
      await repos.profiles.create({ id: sessionProfileId, handle: "session-user", displayName: "Session User", defaultVisibility: POSTURE_C_DEFAULTS });
    });

    it("happy: create and findByTokenHash returns the session", async () => {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await repos.sessions.create({ tokenHash: "token-hash-001", profileId: sessionProfileId, expiresAt });
      const found = await repos.sessions.findByTokenHash("token-hash-001");
      expect(found).not.toBeNull();
      expect(found!.profileId).toBe(sessionProfileId);
      expect(found!.revokedAt).toBeUndefined();
    });

    it("happy: revokeByTokenHash sets revokedAt", async () => {
      await repos.sessions.revokeByTokenHash("token-hash-001");
      const found = await repos.sessions.findByTokenHash("token-hash-001");
      expect(found!.revokedAt).toBeDefined();
    });

    it("happy: revokeAllForProfile revokes all sessions", async () => {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await repos.sessions.create({ tokenHash: "token-hash-002", profileId: sessionProfileId, expiresAt });
      await repos.sessions.revokeAllForProfile(sessionProfileId);
      const found = await repos.sessions.findByTokenHash("token-hash-002");
      expect(found!.revokedAt).toBeDefined();
    });

    it("failure: findByTokenHash returns null for unknown token", async () => {
      const result = await repos.sessions.findByTokenHash("no-such-token");
      expect(result).toBeNull();
    });
  });

  describe("DrizzleHandleHistoryRepository", () => {
    const historyProfileId = uid("c00000000001");

    beforeAll(async () => {
      await repos.profiles.create({ id: historyProfileId, handle: "handle-hist-user", displayName: "Handle Hist User", defaultVisibility: POSTURE_C_DEFAULTS });
    });

    it("happy: record and findCurrentByOldHandle returns the history entry", async () => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
      await repos.handleHistory.record({
        profileId: historyProfileId,
        oldHandle: "old-handle-c",
        retiredAt: now,
        expiresAt,
      });

      const found = await repos.handleHistory.findCurrentByOldHandle("old-handle-c");
      expect(found).not.toBeNull();
      expect(found!.profileId).toBe(historyProfileId);
    });

    it("failure: findCurrentByOldHandle returns null for unknown handle", async () => {
      const result = await repos.handleHistory.findCurrentByOldHandle("never-existed");
      expect(result).toBeNull();
    });

    it("failure: findCurrentByOldHandle returns null for expired entry", async () => {
      const pastDate = new Date(Date.now() - 1000);
      await repos.handleHistory.record({
        profileId: historyProfileId,
        oldHandle: "expired-handle",
        retiredAt: pastDate,
        expiresAt: pastDate,
      });
      const result = await repos.handleHistory.findCurrentByOldHandle("expired-handle");
      expect(result).toBeNull();
    });
  });

  describe("DrizzleListRepository", () => {
    const listOwnerId = uid("d00000000001");
    const listBookId = uid("d00000000002");

    beforeAll(async () => {
      await repos.profiles.create({ id: listOwnerId, handle: "list-owner", displayName: "List Owner", defaultVisibility: POSTURE_C_DEFAULTS });
      await db.execute(
        `INSERT INTO books (id, canonical_title, created_at, updated_at) VALUES ('${listBookId}', 'List Book', now(), now())`
      );
    });

    it("happy: create and findById returns the list", async () => {
      const listId = uid("d00000000003");
      const list = await repos.lists.create({
        id: listId,
        ownerId: listOwnerId,
        title: "My Favorites",
        visibility: "public",
      });
      expect(list.title).toBe("My Favorites");

      const found = await repos.lists.findById(listId);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(listId);
    });

    it("happy: addItem and listItems returns the book", async () => {
      const listId = uid("d00000000004");
      await repos.lists.create({ id: listId, ownerId: listOwnerId, title: "With Items", visibility: "public" });
      await repos.lists.addItem({ listId, bookId: listBookId, position: 0 });

      const items = await repos.lists.listItems(listId);
      expect(items.length).toBe(1);
      expect(items[0]!.bookId).toBe(listBookId);
    });

    it("failure: findById returns null for unknown list", async () => {
      const result = await repos.lists.findById(uid("999999999940"));
      expect(result).toBeNull();
    });
  });

  describe("DrizzleNotificationRepository", () => {
    const notifProfileId = uid("e00000000001");

    beforeAll(async () => {
      await repos.profiles.create({ id: notifProfileId, handle: "notif-user", displayName: "Notif User", defaultVisibility: POSTURE_C_DEFAULTS });
    });

    it("happy: registerToken and listTokensForProfile returns the token", async () => {
      await repos.notifications.registerToken({
        profileId: notifProfileId,
        platform: "apns",
        token: "device-token-001",
      });
      const tokens = await repos.notifications.listTokensForProfile(notifProfileId);
      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens[0]!.token).toBe("device-token-001");
    });

    it("happy: setSetting and getSetting returns the setting", async () => {
      await repos.notifications.setSetting({ profileId: notifProfileId, key: "push_enabled", value: true });
      const setting = await repos.notifications.getSetting({ profileId: notifProfileId, key: "push_enabled" });
      expect(setting).not.toBeNull();
      expect(setting!.value).toBe(true);
    });

    it("happy: removeToken removes the token", async () => {
      await repos.notifications.removeToken({ profileId: notifProfileId, token: "device-token-001" });
      const tokens = await repos.notifications.listTokensForProfile(notifProfileId);
      const found = tokens.find((t) => t.token === "device-token-001");
      expect(found).toBeUndefined();
    });

    it("failure: getSetting returns null for unknown key", async () => {
      const result = await repos.notifications.getSetting({ profileId: notifProfileId, key: "no-such-key" });
      expect(result).toBeNull();
    });
  });

  describe("DrizzleActivityRepository", () => {
    const actorId = uid("f00000000001");
    const activityBookId = uid("f00000000002");
    const viewerId = uid("f00000000003");

    beforeAll(async () => {
      await Promise.all([
        repos.profiles.create({ id: actorId, handle: "activity-actor", displayName: "Actor", defaultVisibility: POSTURE_C_DEFAULTS }),
        repos.profiles.create({ id: viewerId, handle: "activity-viewer", displayName: "Viewer", defaultVisibility: POSTURE_C_DEFAULTS }),
      ]);
      await db.execute(
        `INSERT INTO books (id, canonical_title, created_at, updated_at) VALUES ('${activityBookId}', 'Activity Book', now(), now())`
      );
      await repos.follows.follow({ followerId: viewerId, followeeId: actorId });
    });

    it("happy: append creates an activity event", async () => {
      const event = await repos.activity.append({
        actorId,
        verb: "book_finished",
        bookId: activityBookId,
        visibility: "followers",
      });
      expect(event.actorId).toBe(actorId);
      expect(event.verb).toBe("book_finished");
    });

    it("happy: getFriendFeed returns events from followed users", async () => {
      const feed = await repos.activity.getFriendFeed({ viewerId, limit: 10 });
      expect(feed.length).toBeGreaterThan(0);
      expect(feed[0]!.event.actorId).toBe(actorId);
    });

    it("failure: getFriendFeed returns empty array when user follows nobody", async () => {
      const lonelyId = uid("f00000000099");
      await repos.profiles.create({ id: lonelyId, handle: "lonely", displayName: "Lonely", defaultVisibility: POSTURE_C_DEFAULTS });
      const feed = await repos.activity.getFriendFeed({ viewerId: lonelyId, limit: 10 });
      expect(feed).toHaveLength(0);
    });
  });

  describe("DrizzleRecommendationRepository", () => {
    const recUserId = uid("ff0000000001");
    const recBookId = uid("ff0000000002");

    beforeAll(async () => {
      await repos.profiles.create({
        id: recUserId,
        handle: "rec-user",
        displayName: "Rec User",
        defaultVisibility: POSTURE_C_DEFAULTS,
      });
      await db.execute(
        `INSERT INTO books (id, canonical_title, created_at, updated_at) VALUES ('${recBookId}', 'Rec Book', now(), now())`
      );
      await db.execute(
        `INSERT INTO recommendation_scores (user_id, book_id, score, reason) VALUES ('${recUserId}', '${recBookId}', 95, 'liked similar genre')`
      );
    });

    it("happy: getForUser returns recommendations for the user", async () => {
      const recs = await repos.recommendations.getForUser(recUserId, 10);
      expect(recs.length).toBeGreaterThan(0);
      expect(recs[0]!.score).toBe(95);
      expect(recs[0]!.reason).toBe("liked similar genre");
    });

    it("failure: getForUser returns empty array for unknown user", async () => {
      const recs = await repos.recommendations.getForUser(uid("e99999999999"), 10);
      expect(recs).toHaveLength(0);
    });
  });

  describe("DrizzleAccountDeletionRepository.purgeProfile (R-02)", () => {
    const targetId = uid("aa0000000001");
    const otherId = uid("aa0000000002");
    const purgeBookId = uid("aa0000000003");
    const purgeShelfId = uid("aa0000000004");
    const purgeListId = uid("aa0000000005");
    const purgeReviewIdSeed = uid("aa0000000006");

    beforeAll(async () => {
      await repos.profiles.create({
        id: targetId,
        handle: "purge-target",
        displayName: "Purge Target",
        defaultVisibility: POSTURE_C_DEFAULTS,
      });
      await repos.profiles.create({
        id: otherId,
        handle: "purge-other",
        displayName: "Purge Other",
        defaultVisibility: POSTURE_C_DEFAULTS,
      });
      await db.execute(
        `INSERT INTO books (id, canonical_title, created_at, updated_at) VALUES ('${purgeBookId}', 'Purge Book', now(), now())`
      );

      // shelf + shelf items
      await db.execute(
        `INSERT INTO shelves (id, owner_id, name, slug, visibility, is_system, kind, author_type, version, created_at, updated_at) VALUES ('${purgeShelfId}', '${targetId}', 'My Shelf', 'my-shelf', 'public', false, 'custom', 'user', 1, now(), now())`
      );
      await db.execute(
        `INSERT INTO shelf_items (shelf_id, book_id, status, added_at, updated_at) VALUES ('${purgeShelfId}', '${purgeBookId}', 'reading', now(), now())`
      );

      // list (stored as a shelf with kind='list') + list items
      await db.execute(
        `INSERT INTO shelves (id, owner_id, name, slug, visibility, is_system, kind, author_type, version, created_at, updated_at) VALUES ('${purgeListId}', '${targetId}', 'My List', 'my-list', 'public', false, 'list', 'user', 1, now(), now())`
      );
      await db.execute(
        `INSERT INTO shelf_items (shelf_id, book_id, status, position, added_at, updated_at) VALUES ('${purgeListId}', '${purgeBookId}', 'want_to_read', 0, now(), now())`
      );

      // review
      await db.execute(
        `INSERT INTO reviews (id, author_id, book_id, body, visibility, version, created_at, updated_at) VALUES ('${purgeReviewIdSeed}', '${targetId}', '${purgeBookId}', 'a review', 'public', 1, now(), now())`
      );

      // activity events / feed
      await db.execute(
        `INSERT INTO activity_events (actor_id, verb, book_id, visibility, occurred_at) VALUES ('${targetId}', 'book_added', '${purgeBookId}', 'followers', now())`
      );

      // ranking signals
      await db.execute(
        `INSERT INTO rankings (profile_id, book_id, position, score, bucket, version, created_at, updated_at) VALUES ('${targetId}', '${purgeBookId}', 1, 5.0, 1, 1, now(), now())`
      );

      // follows — both directions
      await db.execute(
        `INSERT INTO follows (follower_id, followee_id, created_at) VALUES ('${targetId}', '${otherId}', now())`
      );
      await db.execute(
        `INSERT INTO follows (follower_id, followee_id, created_at) VALUES ('${otherId}', '${targetId}', now())`
      );

      // blocks placed BY the user (cleared) and AGAINST the user (also
      // cleared from `blocks`; retention via blocks_against_hash is
      // handled by #154 and is out of scope here).
      await db.execute(
        `INSERT INTO blocks (blocker_id, blocked_id, created_at) VALUES ('${targetId}', '${otherId}', now())`
      );
      await db.execute(
        `INSERT INTO blocks (blocker_id, blocked_id, created_at) VALUES ('${otherId}', '${targetId}', now())`
      );

      // auth identity, phone number, contacts, email index, handle
      // history, sessions, imports, push tokens, notification settings,
      // taste vectors, recommendation scores, in-app notifications.
      await db.execute(
        `INSERT INTO auth_identities (provider, provider_user_id, profile_id) VALUES ('apple', 'apple-${targetId}', '${targetId}')`
      );
      await db.execute(
        `INSERT INTO phone_numbers (profile_id, e164_hash) VALUES ('${targetId}', 'phone-hash-${targetId}')`
      );
      await db.execute(
        `INSERT INTO contacts_index (profile_id, contact_hash, salt_version, expires_at) VALUES ('${targetId}', 'contact-${targetId}', 1, now() + interval '30 days')`
      );
      await db.execute(
        `INSERT INTO email_index (profile_id, email_hash, salt_version, expires_at) VALUES ('${targetId}', 'email-${targetId}', 1, now() + interval '30 days')`
      );
      await db.execute(
        `INSERT INTO handle_history (profile_id, old_handle, retired_at, expires_at) VALUES ('${targetId}', 'old-handle', now(), now() + interval '5 years')`
      );
      await db.execute(
        `INSERT INTO sessions (token_hash, profile_id, expires_at) VALUES ('session-${targetId}', '${targetId}', now() + interval '30 days')`
      );
      await db.execute(
        `INSERT INTO imports (owner_id, source, status, created_at) VALUES ('${targetId}', 'goodreads', 'completed', now())`
      );
      await db.execute(
        `INSERT INTO notification_tokens (profile_id, platform, token, last_seen) VALUES ('${targetId}', 'apns', 'token-${targetId}', now())`
      );
      await db.execute(
        `INSERT INTO notification_settings (profile_id, key, value) VALUES ('${targetId}', 'foo', '"bar"'::jsonb)`
      );
      await db.execute(
        `INSERT INTO taste_vectors (profile_id, vector, updated_at) VALUES ('${targetId}', '[]'::jsonb, now())`
      );
      await db.execute(
        `INSERT INTO recommendation_scores (user_id, book_id, score, reason) VALUES ('${targetId}', '${purgeBookId}', 80, 'taste')`
      );
      await db.execute(
        `INSERT INTO in_app_notifications (recipient_id, actor_id, trigger, payload) VALUES ('${targetId}', '${otherId}', 'new_follower', '{}'::jsonb)`
      );
      await db.execute(
        `INSERT INTO in_app_notifications (recipient_id, actor_id, trigger, payload) VALUES ('${otherId}', '${targetId}', 'new_follower', '{}'::jsonb)`
      );

      // The deletion record itself — grace expired.
      await repos.accountDeletions.create({
        profileId: targetId,
        requestedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
        hardDeleteAfter: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      });
    });

    it("listExpired returns deletions whose grace has passed", async () => {
      const expired = await repos.accountDeletions.listExpired(new Date());
      const ids = expired.map((r) => r.profileId);
      expect(ids).toContain(targetId);
    });

    it("purgeProfile removes every user-scoped row and the deletion record", async () => {
      await repos.accountDeletions.purgeProfile(targetId);

      // profile gone
      const profile = await repos.profiles.findById(targetId);
      expect(profile).toBeNull();

      // deletion record gone
      const deletion = await repos.accountDeletions.findByProfileId(targetId);
      expect(deletion).toBeNull();

      // Each user-scoped table no longer holds rows referencing the user.
      const assertEmpty = async (sql: string, label: string) => {
        const result = await db.execute(sql);
        // node-pg result: { rows: [{ count: '0' }], ... }
        const rows = (result as unknown as { rows: Array<{ count: string }> }).rows;
        expect(
          Number(rows[0]!.count),
          `expected no rows for ${label}`,
        ).toBe(0);
      };

      await assertEmpty(
        `SELECT count(*) FROM shelves WHERE owner_id = '${targetId}'`,
        "shelves",
      );
      await assertEmpty(
        `SELECT count(*) FROM shelf_items WHERE shelf_id IN ('${purgeShelfId}', '${purgeListId}')`,
        "shelf_items",
      );
      await assertEmpty(
        `SELECT count(*) FROM reviews WHERE author_id = '${targetId}'`,
        "reviews",
      );
      await assertEmpty(
        `SELECT count(*) FROM activity_events WHERE actor_id = '${targetId}'`,
        "activity_events",
      );
      await assertEmpty(
        `SELECT count(*) FROM rankings WHERE profile_id = '${targetId}'`,
        "rankings",
      );
      await assertEmpty(
        `SELECT count(*) FROM follows WHERE follower_id = '${targetId}' OR followee_id = '${targetId}'`,
        "follows (both sides)",
      );
      await assertEmpty(
        `SELECT count(*) FROM blocks WHERE blocker_id = '${targetId}' OR blocked_id = '${targetId}'`,
        "blocks",
      );
      await assertEmpty(
        `SELECT count(*) FROM auth_identities WHERE profile_id = '${targetId}'`,
        "auth_identities",
      );
      await assertEmpty(
        `SELECT count(*) FROM phone_numbers WHERE profile_id = '${targetId}'`,
        "phone_numbers",
      );
      await assertEmpty(
        `SELECT count(*) FROM contacts_index WHERE profile_id = '${targetId}'`,
        "contacts_index",
      );
      await assertEmpty(
        `SELECT count(*) FROM email_index WHERE profile_id = '${targetId}'`,
        "email_index",
      );
      await assertEmpty(
        `SELECT count(*) FROM handle_history WHERE profile_id = '${targetId}'`,
        "handle_history",
      );
      await assertEmpty(
        `SELECT count(*) FROM sessions WHERE profile_id = '${targetId}'`,
        "sessions",
      );
      await assertEmpty(
        `SELECT count(*) FROM imports WHERE owner_id = '${targetId}'`,
        "imports",
      );
      await assertEmpty(
        `SELECT count(*) FROM notification_tokens WHERE profile_id = '${targetId}'`,
        "notification_tokens",
      );
      await assertEmpty(
        `SELECT count(*) FROM notification_settings WHERE profile_id = '${targetId}'`,
        "notification_settings",
      );
      await assertEmpty(
        `SELECT count(*) FROM taste_vectors WHERE profile_id = '${targetId}'`,
        "taste_vectors",
      );
      await assertEmpty(
        `SELECT count(*) FROM recommendation_scores WHERE user_id = '${targetId}'`,
        "recommendation_scores",
      );
      await assertEmpty(
        `SELECT count(*) FROM in_app_notifications WHERE recipient_id = '${targetId}' OR actor_id = '${targetId}'`,
        "in_app_notifications",
      );
      await assertEmpty(
        `SELECT count(*) FROM account_deletions WHERE profile_id = '${targetId}'`,
        "account_deletions",
      );

      // Sanity check — the OTHER profile is untouched.
      const other = await repos.profiles.findById(otherId);
      expect(other).not.toBeNull();
    });
  });
});
