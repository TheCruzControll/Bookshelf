import { describe, it, expect, vi } from "vitest";
import { ContactsService } from "./services";
import type { BlockRepository, ContactsRepository, EmailIndexRepository, SaltRepository } from "./ports";

function makeContactsRepo(overrides?: Partial<ContactsRepository>): ContactsRepository {
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
});
