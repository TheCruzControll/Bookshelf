import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import { ContactsService } from "./services";
import type {
  BlockRepository,
  ContactsRepository,
  EmailIndexRepository,
  FollowRepository,
  ProfileRepository,
  SaltRepository,
} from "./ports";
import type { Profile, Visibility } from "./types";

function makeContactsRepo(overrides?: Partial<ContactsRepository>): ContactsRepository {
  return {
    upsertHashes: vi.fn().mockResolvedValue(undefined),
    findMatches: vi.fn().mockResolvedValue([]),
    findMatchingProfilesByPhone: vi.fn().mockResolvedValue([]),
    deleteForUser: vi.fn().mockResolvedValue(undefined),
    deleteExpired: vi.fn().mockResolvedValue(undefined),
    expireBySaltVersion: vi.fn().mockResolvedValue(0),
    deleteByTargetHash: vi.fn().mockResolvedValue(undefined),
    listByUser: vi.fn().mockResolvedValue([]),
    softDisable: vi.fn().mockResolvedValue(undefined),
    purgeOlderThan: vi.fn().mockResolvedValue(0),
    ...overrides,
  };
}

function makeEmailIndexRepo(overrides?: Partial<EmailIndexRepository>): EmailIndexRepository {
  return {
    upsertHashes: vi.fn().mockResolvedValue(undefined),
    findMatches: vi.fn().mockResolvedValue([]),
    deleteForUser: vi.fn().mockResolvedValue(undefined),
    deleteExpired: vi.fn().mockResolvedValue(undefined),
    expireBySaltVersion: vi.fn().mockResolvedValue(0),
    deleteByTargetHash: vi.fn().mockResolvedValue(undefined),
    listByUser: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function makeBlockRepo(overrides?: Partial<BlockRepository>): BlockRepository {
  return {
    block: vi.fn(),
    unblock: vi.fn(),
    findBlock: vi.fn(),
    listBlockedByUser: vi.fn().mockResolvedValue([]),
    listBlockingUser: vi.fn().mockResolvedValue([]),
    isBlocked: vi.fn().mockResolvedValue(false),
    migrateBlocksAgainstToHash: vi.fn().mockResolvedValue(0),
    findAgainstHashEntries: vi.fn().mockResolvedValue([]),
    createMany: vi.fn().mockResolvedValue(0),
    ...overrides,
  };
}

const PUBLIC_VISIBILITY = {
  identity: "public" as Visibility,
  follower_list: "public" as Visibility,
  review: "public" as Visibility,
  score: "public" as Visibility,
  finished_shelf: "public" as Visibility,
  custom_shelf: "public" as Visibility,
  want_to_read_shelf: "followers" as Visibility,
  reading_shelf: "followers" as Visibility,
  dropped_shelf: "followers" as Visibility,
  reading_status: "followers" as Visibility,
  activity_stream: "followers" as Visibility,
};

function makeProfile(id: string, handle: string, identityVisibility: Visibility = "public"): Profile {
  return {
    id,
    handle,
    displayName: `User ${handle}`,
    avatarUrl: undefined,
    verified: false,
    defaultVisibility: { ...PUBLIC_VISIBILITY, identity: identityVisibility },
    version: 1,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
  };
}

function makeProfileRepo(profiles: Map<string, Profile>, overrides?: Partial<ProfileRepository>): ProfileRepository {
  return {
    findById: vi.fn(async (id: string) => profiles.get(id) ?? null),
    findByHandle: vi.fn(),
    create: vi.fn(),
    isHandleTaken: vi.fn(),
    setHandle: vi.fn(),
    ...overrides,
  };
}

function makeFollowRepo(overrides?: Partial<FollowRepository>): FollowRepository {
  return {
    follow: vi.fn(),
    unfollow: vi.fn(),
    findFollow: vi.fn().mockResolvedValue(null),
    listFollowers: vi.fn().mockResolvedValue([]),
    listFollowing: vi.fn().mockResolvedValue([]),
    isMutual: vi.fn().mockResolvedValue(false),
    countMutuals: vi.fn().mockResolvedValue(0),
    listMutualIds: vi.fn().mockResolvedValue([]),
      listFriendsOfFriends: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function makeSaltRepo(overrides?: Partial<SaltRepository>): SaltRepository {
  return {
    create: vi.fn(),
    findActive: vi.fn().mockResolvedValue({
      id: "salt-1",
      version: 5,
      keyMaterial: "key-material",
      activeFrom: new Date("2026-05-01"),
      activeTo: undefined,
      createdAt: new Date("2026-05-01"),
    }),
    findByVersion: vi.fn(),
    retire: vi.fn(),
    getLatestVersion: vi.fn(),
    listAll: vi.fn(),
    ...overrides,
  };
}

describe("ContactsService", () => {
  describe("uploadPhoneHashes", () => {
    it("delegates to contacts repository", async () => {
      const contacts = makeContactsRepo();
      const emailIndex = makeEmailIndexRepo();
      const blocks = makeBlockRepo();
      const service = new ContactsService(contacts, emailIndex, blocks);

      const hashes = [
        { hash: "abc123", saltVersion: 1, expiresAt: new Date("2026-06-01") },
      ];

      await service.uploadPhoneHashes({ userId: "user-1", hashes });

      expect(contacts.upsertHashes).toHaveBeenCalledWith({
        userId: "user-1",
        hashes,
      });
    });
  });

  describe("uploadEmailHashes", () => {
    it("delegates to email index repository", async () => {
      const contacts = makeContactsRepo();
      const emailIndex = makeEmailIndexRepo();
      const blocks = makeBlockRepo();
      const service = new ContactsService(contacts, emailIndex, blocks);

      const hashes = [
        { hash: "def456", saltVersion: 1, expiresAt: new Date("2026-06-01") },
      ];

      await service.uploadEmailHashes({ userId: "user-1", hashes });

      expect(emailIndex.upsertHashes).toHaveBeenCalledWith({
        userId: "user-1",
        hashes,
      });
    });
  });

  describe("matchPhones", () => {
    it("returns matched user IDs from phone index, filtering blocked", async () => {
      const contacts = makeContactsRepo({
        findMatches: vi.fn().mockResolvedValue(["user-2", "user-3"]),
      });
      const emailIndex = makeEmailIndexRepo();
      const blocks = makeBlockRepo({
        listBlockedByUser: vi.fn().mockResolvedValue([
          { id: "b1", blockerId: "user-1", blockedId: "user-3", createdAt: new Date() },
        ]),
        listBlockingUser: vi.fn().mockResolvedValue([]),
      });
      const service = new ContactsService(contacts, emailIndex, blocks);

      const result = await service.matchPhones({
        hashes: ["hash1", "hash2"],
        viewerId: "user-1",
      });

      expect(contacts.findMatches).toHaveBeenCalledWith({
        hashes: ["hash1", "hash2"],
        excludeUserId: "user-1",
      });
      expect(result).toEqual(["user-2"]);
    });
  });

  describe("matchEmails", () => {
    it("returns matched user IDs from email index, filtering blocked", async () => {
      const contacts = makeContactsRepo();
      const emailIndex = makeEmailIndexRepo({
        findMatches: vi.fn().mockResolvedValue(["user-4", "user-5"]),
      });
      const blocks = makeBlockRepo({
        listBlockedByUser: vi.fn().mockResolvedValue([]),
        listBlockingUser: vi.fn().mockResolvedValue([
          { id: "b2", blockerId: "user-5", blockedId: "user-1", createdAt: new Date() },
        ]),
      });
      const service = new ContactsService(contacts, emailIndex, blocks);

      const result = await service.matchEmails({
        hashes: ["emailhash1"],
        viewerId: "user-1",
      });

      expect(emailIndex.findMatches).toHaveBeenCalledWith({
        hashes: ["emailhash1"],
        excludeUserId: "user-1",
      });
      expect(result).toEqual(["user-4"]);
    });
  });

  describe("deleteForUser", () => {
    it("deletes from both phone and email indexes", async () => {
      const contacts = makeContactsRepo();
      const emailIndex = makeEmailIndexRepo();
      const blocks = makeBlockRepo();
      const service = new ContactsService(contacts, emailIndex, blocks);

      await service.deleteForUser("user-1");

      expect(contacts.deleteForUser).toHaveBeenCalledWith("user-1");
      expect(emailIndex.deleteForUser).toHaveBeenCalledWith("user-1");
    });
  });

  describe("deleteExpired", () => {
    it("deletes expired from both indexes", async () => {
      const contacts = makeContactsRepo();
      const emailIndex = makeEmailIndexRepo();
      const blocks = makeBlockRepo();
      const service = new ContactsService(contacts, emailIndex, blocks);

      await service.deleteExpired();

      expect(contacts.deleteExpired).toHaveBeenCalled();
      expect(emailIndex.deleteExpired).toHaveBeenCalled();
    });
  });

  describe("match", () => {
    it("joins contacts_index against phone_numbers and returns minimal profile shape", async () => {
      const contacts = makeContactsRepo({
        findMatchingProfilesByPhone: vi.fn().mockResolvedValue(["user-2", "user-3"]),
      });
      const emailIndex = makeEmailIndexRepo();
      const blocks = makeBlockRepo();
      const profiles = new Map<string, Profile>([
        ["user-2", makeProfile("user-2", "alice")],
        ["user-3", makeProfile("user-3", "bob")],
      ]);
      const profileRepo = makeProfileRepo(profiles);
      const followRepo = makeFollowRepo({
        countMutuals: vi.fn().mockResolvedValue(2),
      });
      const service = new ContactsService(contacts, emailIndex, blocks, undefined, profileRepo, followRepo);

      const result = await service.match({ viewerId: "viewer-1" });

      expect(contacts.findMatchingProfilesByPhone).toHaveBeenCalledWith("viewer-1");
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.profileId).sort()).toEqual(["user-2", "user-3"]);
      expect(result[0]).toMatchObject({
        handle: expect.any(String),
        displayName: expect.any(String),
        mutualCount: 2,
      });
    });

    it("excludes profiles the viewer has blocked", async () => {
      const contacts = makeContactsRepo({
        findMatchingProfilesByPhone: vi.fn().mockResolvedValue(["user-2", "user-3"]),
      });
      const emailIndex = makeEmailIndexRepo();
      const blocks = makeBlockRepo({
        listBlockedByUser: vi.fn().mockResolvedValue([
          { id: "b1", blockerId: "viewer-1", blockedId: "user-3", createdAt: new Date() },
        ]),
      });
      const profiles = new Map<string, Profile>([
        ["user-2", makeProfile("user-2", "alice")],
        ["user-3", makeProfile("user-3", "bob")],
      ]);
      const service = new ContactsService(
        contacts,
        emailIndex,
        blocks,
        undefined,
        makeProfileRepo(profiles),
        makeFollowRepo(),
      );

      const result = await service.match({ viewerId: "viewer-1" });

      expect(result.map((r) => r.profileId)).toEqual(["user-2"]);
    });

    it("excludes profiles that blocked the viewer", async () => {
      const contacts = makeContactsRepo({
        findMatchingProfilesByPhone: vi.fn().mockResolvedValue(["user-2", "user-3"]),
      });
      const emailIndex = makeEmailIndexRepo();
      const blocks = makeBlockRepo({
        listBlockingUser: vi.fn().mockResolvedValue([
          { id: "b2", blockerId: "user-2", blockedId: "viewer-1", createdAt: new Date() },
        ]),
      });
      const profiles = new Map<string, Profile>([
        ["user-2", makeProfile("user-2", "alice")],
        ["user-3", makeProfile("user-3", "bob")],
      ]);
      const service = new ContactsService(
        contacts,
        emailIndex,
        blocks,
        undefined,
        makeProfileRepo(profiles),
        makeFollowRepo(),
      );

      const result = await service.match({ viewerId: "viewer-1" });

      expect(result.map((r) => r.profileId)).toEqual(["user-3"]);
    });

    it("filters out profiles whose identity is private to non-self viewers", async () => {
      const contacts = makeContactsRepo({
        findMatchingProfilesByPhone: vi.fn().mockResolvedValue(["user-2", "user-3"]),
      });
      const emailIndex = makeEmailIndexRepo();
      const blocks = makeBlockRepo();
      const profiles = new Map<string, Profile>([
        ["user-2", makeProfile("user-2", "alice", "public")],
        ["user-3", makeProfile("user-3", "bob", "private")],
      ]);
      const service = new ContactsService(
        contacts,
        emailIndex,
        blocks,
        undefined,
        makeProfileRepo(profiles),
        makeFollowRepo(),
      );

      const result = await service.match({ viewerId: "viewer-1" });

      expect(result.map((r) => r.profileId)).toEqual(["user-2"]);
    });

    it("includes profiles whose identity is mutuals-only when viewer is a mutual", async () => {
      const contacts = makeContactsRepo({
        findMatchingProfilesByPhone: vi.fn().mockResolvedValue(["user-2"]),
      });
      const emailIndex = makeEmailIndexRepo();
      const blocks = makeBlockRepo();
      const profiles = new Map<string, Profile>([
        ["user-2", makeProfile("user-2", "alice", "mutuals")],
      ]);
      const followRepo = makeFollowRepo({
        isMutual: vi.fn().mockResolvedValue(true),
      });
      const service = new ContactsService(
        contacts,
        emailIndex,
        blocks,
        undefined,
        makeProfileRepo(profiles),
        followRepo,
      );

      const result = await service.match({ viewerId: "viewer-1" });

      expect(result.map((r) => r.profileId)).toEqual(["user-2"]);
    });

    it("returns empty when the viewer has no uploaded contact hashes", async () => {
      const contacts = makeContactsRepo({
        findMatchingProfilesByPhone: vi.fn().mockResolvedValue([]),
      });
      const emailIndex = makeEmailIndexRepo();
      const blocks = makeBlockRepo();
      const service = new ContactsService(
        contacts,
        emailIndex,
        blocks,
        undefined,
        makeProfileRepo(new Map()),
        makeFollowRepo(),
      );

      const result = await service.match({ viewerId: "viewer-1" });

      expect(result).toEqual([]);
    });

    it("skips missing profiles (soft-deleted) without throwing", async () => {
      const contacts = makeContactsRepo({
        findMatchingProfilesByPhone: vi.fn().mockResolvedValue(["user-2", "ghost"]),
      });
      const emailIndex = makeEmailIndexRepo();
      const blocks = makeBlockRepo();
      const profiles = new Map<string, Profile>([
        ["user-2", makeProfile("user-2", "alice")],
      ]);
      const service = new ContactsService(
        contacts,
        emailIndex,
        blocks,
        undefined,
        makeProfileRepo(profiles),
        makeFollowRepo(),
      );

      const result = await service.match({ viewerId: "viewer-1" });

      expect(result.map((r) => r.profileId)).toEqual(["user-2"]);
    });

    it("throws INTERNAL_ERROR when profile repository is not configured", async () => {
      const contacts = makeContactsRepo();
      const emailIndex = makeEmailIndexRepo();
      const blocks = makeBlockRepo();
      const service = new ContactsService(contacts, emailIndex, blocks);

      await expect(service.match({ viewerId: "viewer-1" })).rejects.toMatchObject({
        code: "INTERNAL_ERROR",
      });
    });

    it("property: result is a subset of candidates and never contains blocked or non-public profiles", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uniqueArray(fc.stringMatching(/^p[0-9]{1,3}$/), { minLength: 0, maxLength: 12 }),
          fc.uniqueArray(fc.stringMatching(/^p[0-9]{1,3}$/), { minLength: 0, maxLength: 8 }),
          fc.uniqueArray(fc.stringMatching(/^p[0-9]{1,3}$/), { minLength: 0, maxLength: 8 }),
          fc.uniqueArray(fc.stringMatching(/^p[0-9]{1,3}$/), { minLength: 0, maxLength: 8 }),
          async (candidates, blockedByViewer, blockingViewer, privateIds) => {
            const viewerId = "viewer";
            const candidateIds = candidates.filter((id) => id !== viewerId);

            const contacts = makeContactsRepo({
              findMatchingProfilesByPhone: vi.fn().mockResolvedValue(candidateIds),
            });
            const emailIndex = makeEmailIndexRepo();
            const blocks = makeBlockRepo({
              listBlockedByUser: vi.fn().mockResolvedValue(
                blockedByViewer.map((blockedId, i) => ({
                  id: `bo-${i}`,
                  blockerId: viewerId,
                  blockedId,
                  createdAt: new Date(),
                })),
              ),
              listBlockingUser: vi.fn().mockResolvedValue(
                blockingViewer.map((blockerId, i) => ({
                  id: `bi-${i}`,
                  blockerId,
                  blockedId: viewerId,
                  createdAt: new Date(),
                })),
              ),
            });
            const privSet = new Set(privateIds);
            const profileMap = new Map<string, Profile>();
            for (const id of candidateIds) {
              profileMap.set(id, makeProfile(id, id, privSet.has(id) ? "private" : "public"));
            }
            const service = new ContactsService(
              contacts,
              emailIndex,
              blocks,
              undefined,
              makeProfileRepo(profileMap),
              makeFollowRepo(),
            );

            const result = await service.match({ viewerId });
            const resultIds = new Set(result.map((r) => r.profileId));

            for (const id of resultIds) {
              expect(candidateIds).toContain(id);
            }
            for (const id of blockedByViewer) {
              expect(resultIds.has(id)).toBe(false);
            }
            for (const id of blockingViewer) {
              expect(resultIds.has(id)).toBe(false);
            }
            for (const id of privateIds) {
              expect(resultIds.has(id)).toBe(false);
            }
          },
        ),
        { numRuns: 30 },
      );
    });
  });

  describe("validateSaltVersion", () => {
    it("passes when salt version matches active salt", async () => {
      const contacts = makeContactsRepo();
      const emailIndex = makeEmailIndexRepo();
      const blocks = makeBlockRepo();
      const salts = makeSaltRepo();
      const service = new ContactsService(contacts, emailIndex, blocks, salts);

      await expect(service.validateSaltVersion(5)).resolves.toBeUndefined();
      expect(salts.findActive).toHaveBeenCalled();
    });

    it("throws STALE_SALT when salt version does not match", async () => {
      const contacts = makeContactsRepo();
      const emailIndex = makeEmailIndexRepo();
      const blocks = makeBlockRepo();
      const salts = makeSaltRepo();
      const service = new ContactsService(contacts, emailIndex, blocks, salts);

      await expect(service.validateSaltVersion(3)).rejects.toMatchObject({
        code: "STALE_SALT",
        expectedVersion: 5,
      });
    });

    it("throws INTERNAL_ERROR when no active salt exists", async () => {
      const contacts = makeContactsRepo();
      const emailIndex = makeEmailIndexRepo();
      const blocks = makeBlockRepo();
      const salts = makeSaltRepo({ findActive: vi.fn().mockResolvedValue(null) });
      const service = new ContactsService(contacts, emailIndex, blocks, salts);

      await expect(service.validateSaltVersion(1)).rejects.toMatchObject({
        code: "INTERNAL_ERROR",
      });
    });

    it("throws INTERNAL_ERROR when salt repository is not configured", async () => {
      const contacts = makeContactsRepo();
      const emailIndex = makeEmailIndexRepo();
      const blocks = makeBlockRepo();
      const service = new ContactsService(contacts, emailIndex, blocks);

      await expect(service.validateSaltVersion(1)).rejects.toMatchObject({
        code: "INTERNAL_ERROR",
      });
    });
  });

  describe("disableSync", () => {
    it("soft-disables every row owned by the viewer at `now`", async () => {
      const contacts = makeContactsRepo();
      const emailIndex = makeEmailIndexRepo();
      const blocks = makeBlockRepo();
      const service = new ContactsService(contacts, emailIndex, blocks);

      const now = new Date("2026-05-16T12:00:00Z");
      const result = await service.disableSync({ viewerId: "viewer-1", now });

      expect(contacts.softDisable).toHaveBeenCalledTimes(1);
      expect(contacts.softDisable).toHaveBeenCalledWith({
        userId: "viewer-1",
        now,
      });
      expect(result).toEqual({ disabled: true });
    });

    it("defaults `now` to the current time when omitted", async () => {
      const contacts = makeContactsRepo();
      const emailIndex = makeEmailIndexRepo();
      const blocks = makeBlockRepo();
      const service = new ContactsService(contacts, emailIndex, blocks);

      const before = Date.now();
      await service.disableSync({ viewerId: "viewer-1" });
      const after = Date.now();

      const call = (contacts.softDisable as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as
        | { userId: string; now: Date }
        | undefined;
      expect(call).toBeDefined();
      expect(call?.userId).toBe("viewer-1");
      expect(call?.now.getTime()).toBeGreaterThanOrEqual(before);
      expect(call?.now.getTime()).toBeLessThanOrEqual(after);
    });

    it("does not delete email-index rows", async () => {
      const contacts = makeContactsRepo();
      const emailIndex = makeEmailIndexRepo();
      const blocks = makeBlockRepo();
      const service = new ContactsService(contacts, emailIndex, blocks);

      await service.disableSync({ viewerId: "viewer-1" });

      expect(emailIndex.deleteForUser).not.toHaveBeenCalled();
      expect(contacts.deleteForUser).not.toHaveBeenCalled();
    });
  });

  describe("purgeDisabled", () => {
    it("delegates to purgeOlderThan with cutoff = now - 24h", async () => {
      const contacts = makeContactsRepo({
        purgeOlderThan: vi.fn().mockResolvedValue(3),
      });
      const emailIndex = makeEmailIndexRepo();
      const blocks = makeBlockRepo();
      const service = new ContactsService(contacts, emailIndex, blocks);

      const now = new Date("2026-05-16T12:00:00Z");
      const purged = await service.purgeDisabled(now);

      expect(purged).toBe(3);
      expect(contacts.purgeOlderThan).toHaveBeenCalledTimes(1);
      const cutoff = (contacts.purgeOlderThan as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Date;
      const expected = new Date("2026-05-15T12:00:00Z");
      expect(cutoff.getTime()).toBe(expected.getTime());
    });

    it("returns zero when no rows are old enough to purge", async () => {
      const contacts = makeContactsRepo({
        purgeOlderThan: vi.fn().mockResolvedValue(0),
      });
      const emailIndex = makeEmailIndexRepo();
      const blocks = makeBlockRepo();
      const service = new ContactsService(contacts, emailIndex, blocks);

      const purged = await service.purgeDisabled(new Date("2026-05-16T12:00:00Z"));
      expect(purged).toBe(0);
    });

    it("uses current time when `now` is omitted", async () => {
      const contacts = makeContactsRepo({
        purgeOlderThan: vi.fn().mockResolvedValue(1),
      });
      const emailIndex = makeEmailIndexRepo();
      const blocks = makeBlockRepo();
      const service = new ContactsService(contacts, emailIndex, blocks);

      const before = Date.now();
      await service.purgeDisabled();
      const after = Date.now();

      const cutoff = (contacts.purgeOlderThan as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Date;
      const cutoffMs = cutoff.getTime();
      const twentyFourHoursMs = 24 * 60 * 60 * 1000;
      expect(cutoffMs).toBeGreaterThanOrEqual(before - twentyFourHoursMs);
      expect(cutoffMs).toBeLessThanOrEqual(after - twentyFourHoursMs);
    });
  });
});
