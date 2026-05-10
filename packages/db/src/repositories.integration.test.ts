import { describe, it, expect, beforeAll, afterAll } from "vitest";
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
        defaultVisibility: "public",
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
        defaultVisibility: "public",
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
  });

  describe("DrizzleShelfRepository", () => {
    const ownerId = uid("300000000001");

    beforeAll(async () => {
      await repos.profiles.create({
        id: ownerId,
        handle: "shelf-owner",
        displayName: "Shelf Owner",
        defaultVisibility: "public",
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
        defaultVisibility: "public",
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
        repos.profiles.create({ id: userA, handle: "follow-a", displayName: "A", defaultVisibility: "public" }),
        repos.profiles.create({ id: userB, handle: "follow-b", displayName: "B", defaultVisibility: "public" }),
        repos.profiles.create({ id: userC, handle: "follow-c", displayName: "C", defaultVisibility: "public" }),
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
        repos.profiles.create({ id: blocker, handle: "blocker", displayName: "Blocker", defaultVisibility: "public" }),
        repos.profiles.create({ id: blocked, handle: "blocked", displayName: "Blocked", defaultVisibility: "public" }),
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
      await repos.profiles.create({ id: rankOwnerId, handle: "ranker", displayName: "Ranker", defaultVisibility: "public" });
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
      await repos.profiles.create({ id: importOwnerId, handle: "importer", displayName: "Importer", defaultVisibility: "public" });
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
      await repos.profiles.create({ id: contactsUserId, handle: "contacts-user", displayName: "Contacts User", defaultVisibility: "public" });
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
  });

  describe("DrizzleAuthIdentityRepository", () => {
    const authProfileId = uid("a00000000001");

    beforeAll(async () => {
      await repos.profiles.create({ id: authProfileId, handle: "auth-user", displayName: "Auth User", defaultVisibility: "public" });
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
      await repos.profiles.create({ id: sessionProfileId, handle: "session-user", displayName: "Session User", defaultVisibility: "public" });
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
      await repos.profiles.create({ id: historyProfileId, handle: "handle-hist-user", displayName: "Handle Hist User", defaultVisibility: "public" });
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
      await repos.profiles.create({ id: listOwnerId, handle: "list-owner", displayName: "List Owner", defaultVisibility: "public" });
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
      await repos.profiles.create({ id: notifProfileId, handle: "notif-user", displayName: "Notif User", defaultVisibility: "public" });
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
        repos.profiles.create({ id: actorId, handle: "activity-actor", displayName: "Actor", defaultVisibility: "public" }),
        repos.profiles.create({ id: viewerId, handle: "activity-viewer", displayName: "Viewer", defaultVisibility: "public" }),
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
      await repos.profiles.create({ id: lonelyId, handle: "lonely", displayName: "Lonely", defaultVisibility: "public" });
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
        defaultVisibility: "public",
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
});
