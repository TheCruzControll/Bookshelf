import { describe, it, expect, vi, beforeEach } from "vitest";
import { SaltRotationService } from "./salt-rotation";
import type { ContactsRepository, EmailIndexRepository, SaltKeyProvider, SaltRepository } from "./ports";
import type { Salt } from "./types";

function makeSalt(overrides?: Partial<Salt>): Salt {
  return {
    id: "salt-1",
    version: 1,
    keyMaterial: "deadbeef".repeat(8),
    activeFrom: new Date("2026-04-01"),
    activeTo: undefined,
    createdAt: new Date("2026-04-01"),
    ...overrides,
  };
}

function makeSaltRepo(overrides?: Partial<SaltRepository>): SaltRepository {
  return {
    create: vi.fn().mockImplementation(async (input) =>
      makeSalt({ version: input.version, keyMaterial: input.keyMaterial, activeFrom: input.activeFrom })
    ),
    findActive: vi.fn().mockResolvedValue(null),
    findByVersion: vi.fn().mockResolvedValue(null),
    retire: vi.fn().mockImplementation(async (input) =>
      makeSalt({ version: input.version, activeTo: input.activeTo })
    ),
    getLatestVersion: vi.fn().mockResolvedValue(0),
    listAll: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

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

function makeKeyProvider(overrides?: Partial<SaltKeyProvider>): SaltKeyProvider {
  return {
    generateKey: vi.fn().mockResolvedValue("aabbccdd".repeat(8)),
    ...overrides,
  };
}

describe("SaltRotationService", () => {
  let saltRepo: SaltRepository;
  let contactsRepo: ContactsRepository;
  let emailIndexRepo: EmailIndexRepository;
  let keyProvider: SaltKeyProvider;
  let service: SaltRotationService;

  beforeEach(() => {
    saltRepo = makeSaltRepo();
    contactsRepo = makeContactsRepo();
    emailIndexRepo = makeEmailIndexRepo();
    keyProvider = makeKeyProvider();
    service = new SaltRotationService(saltRepo, contactsRepo, emailIndexRepo, keyProvider);
  });

  describe("getActiveSalt", () => {
    it("returns existing active salt when one exists", async () => {
      const existing = makeSalt();
      saltRepo.findActive = vi.fn().mockResolvedValue(existing);

      const result = await service.getActiveSalt();

      expect(result).toBe(existing);
      expect(keyProvider.generateKey).not.toHaveBeenCalled();
    });

    it("creates a new salt when none exists (bootstrap)", async () => {
      saltRepo.findActive = vi.fn().mockResolvedValue(null);
      saltRepo.getLatestVersion = vi.fn().mockResolvedValue(0);

      const result = await service.getActiveSalt();

      expect(keyProvider.generateKey).toHaveBeenCalledOnce();
      expect(saltRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          version: 1,
          keyMaterial: "aabbccdd".repeat(8),
        })
      );
      expect(result.version).toBe(1);
    });

    it("increments version from latest when bootstrapping", async () => {
      saltRepo.findActive = vi.fn().mockResolvedValue(null);
      saltRepo.getLatestVersion = vi.fn().mockResolvedValue(5);

      await service.getActiveSalt();

      expect(saltRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ version: 6 })
      );
    });
  });

  describe("rotate", () => {
    it("retires current salt and creates a new one", async () => {
      const currentSalt = makeSalt({ version: 3 });
      saltRepo.findActive = vi.fn().mockResolvedValue(currentSalt);
      saltRepo.getLatestVersion = vi.fn().mockResolvedValue(3);

      const newSalt = await service.rotate();

      // Retired old salt
      expect(saltRepo.retire).toHaveBeenCalledWith(
        expect.objectContaining({ version: 3 })
      );

      // Created new salt
      expect(saltRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ version: 4 })
      );

      expect(newSalt.version).toBe(4);
    });

    it("handles rotation when no current salt exists", async () => {
      saltRepo.findActive = vi.fn().mockResolvedValue(null);
      saltRepo.getLatestVersion = vi.fn().mockResolvedValue(0);

      const newSalt = await service.rotate();

      // No retire call since there was no active salt
      expect(saltRepo.retire).not.toHaveBeenCalled();

      // Created first salt
      expect(saltRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ version: 1 })
      );

      expect(newSalt.version).toBe(1);
    });

    it("marks old-salt hashes for expiration during rotation", async () => {
      const currentSalt = makeSalt({ version: 2 });
      saltRepo.findActive = vi.fn().mockResolvedValue(currentSalt);
      saltRepo.getLatestVersion = vi.fn().mockResolvedValue(2);

      await service.rotate();

      expect(contactsRepo.expireBySaltVersion).toHaveBeenCalledWith(
        2,
        expect.any(Date),
      );
      expect(emailIndexRepo.expireBySaltVersion).toHaveBeenCalledWith(
        2,
        expect.any(Date),
      );
    });

    it("skips expiration marking when no previous salt exists", async () => {
      saltRepo.findActive = vi.fn().mockResolvedValue(null);
      saltRepo.getLatestVersion = vi.fn().mockResolvedValue(0);

      await service.rotate();

      expect(contactsRepo.expireBySaltVersion).not.toHaveBeenCalled();
      expect(emailIndexRepo.expireBySaltVersion).not.toHaveBeenCalled();
    });

    it("cleans up expired hashes after rotation", async () => {
      const currentSalt = makeSalt();
      saltRepo.findActive = vi.fn().mockResolvedValue(currentSalt);
      saltRepo.getLatestVersion = vi.fn().mockResolvedValue(1);

      await service.rotate();

      expect(contactsRepo.deleteExpired).toHaveBeenCalledOnce();
      expect(emailIndexRepo.deleteExpired).toHaveBeenCalledOnce();
    });

    it("generates key material via the SaltKeyProvider", async () => {
      saltRepo.findActive = vi.fn().mockResolvedValue(null);
      saltRepo.getLatestVersion = vi.fn().mockResolvedValue(0);

      await service.rotate();

      expect(keyProvider.generateKey).toHaveBeenCalledOnce();
    });
  });

  describe("rehashPhone", () => {
    it("produces a 64-char hex HMAC-SHA-256 digest", () => {
      const salt = makeSalt({ keyMaterial: "test-key-material" });
      const hash = service.rehashPhone("+14155551234", salt);

      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("produces the same hash for the same input and salt", () => {
      const salt = makeSalt({ keyMaterial: "test-key-material" });
      const hash1 = service.rehashPhone("+14155551234", salt);
      const hash2 = service.rehashPhone("+14155551234", salt);

      expect(hash1).toBe(hash2);
    });

    it("produces different hashes for different salts", () => {
      const salt1 = makeSalt({ keyMaterial: "key-one" });
      const salt2 = makeSalt({ keyMaterial: "key-two" });
      const hash1 = service.rehashPhone("+14155551234", salt1);
      const hash2 = service.rehashPhone("+14155551234", salt2);

      expect(hash1).not.toBe(hash2);
    });

    it("produces different hashes for different phones", () => {
      const salt = makeSalt({ keyMaterial: "test-key-material" });
      const hash1 = service.rehashPhone("+14155551234", salt);
      const hash2 = service.rehashPhone("+14155559999", salt);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe("rehashEmail", () => {
    it("produces a 64-char hex digest", () => {
      const salt = makeSalt({ keyMaterial: "test-key-material" });
      const hash = service.rehashEmail("user@example.com", salt);

      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("normalizes email before hashing (case-insensitive, trimmed)", () => {
      const salt = makeSalt({ keyMaterial: "test-key-material" });
      const hash1 = service.rehashEmail("user@example.com", salt);
      const hash2 = service.rehashEmail("  USER@Example.COM  ", salt);

      expect(hash1).toBe(hash2);
    });
  });

  describe("isRotationDue", () => {
    it("returns true when no active salt exists", async () => {
      saltRepo.findActive = vi.fn().mockResolvedValue(null);

      const due = await service.isRotationDue();

      expect(due).toBe(true);
    });

    it("returns false when active salt is fresh (< 30 days old)", async () => {
      const fresh = makeSalt({ activeFrom: new Date() });
      saltRepo.findActive = vi.fn().mockResolvedValue(fresh);

      const due = await service.isRotationDue();

      expect(due).toBe(false);
    });

    it("returns true when active salt is older than 30 days", async () => {
      const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
      const old = makeSalt({ activeFrom: thirtyOneDaysAgo });
      saltRepo.findActive = vi.fn().mockResolvedValue(old);

      const due = await service.isRotationDue();

      expect(due).toBe(true);
    });

    it("returns false when salt is exactly 29 days old", async () => {
      const twentyNineDaysAgo = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
      const recent = makeSalt({ activeFrom: twentyNineDaysAgo });
      saltRepo.findActive = vi.fn().mockResolvedValue(recent);

      const due = await service.isRotationDue();

      expect(due).toBe(false);
    });
  });

  describe("updateUserHashes", () => {
    it("upserts phone hashes with active salt version and 90-day expiry", async () => {
      const activeSalt = makeSalt({ version: 5 });
      saltRepo.findActive = vi.fn().mockResolvedValue(activeSalt);

      await service.updateUserHashes({
        userId: "user-1",
        phoneHashes: [{ hash: "phone-hash-1" }, { hash: "phone-hash-2" }],
        emailHashes: [],
      });

      expect(contactsRepo.upsertHashes).toHaveBeenCalledWith({
        userId: "user-1",
        hashes: expect.arrayContaining([
          expect.objectContaining({
            hash: "phone-hash-1",
            saltVersion: 5,
          }),
          expect.objectContaining({
            hash: "phone-hash-2",
            saltVersion: 5,
          }),
        ]),
      });
    });

    it("upserts email hashes with active salt version", async () => {
      const activeSalt = makeSalt({ version: 3 });
      saltRepo.findActive = vi.fn().mockResolvedValue(activeSalt);

      await service.updateUserHashes({
        userId: "user-1",
        phoneHashes: [],
        emailHashes: [{ hash: "email-hash-1" }],
      });

      expect(emailIndexRepo.upsertHashes).toHaveBeenCalledWith({
        userId: "user-1",
        hashes: expect.arrayContaining([
          expect.objectContaining({
            hash: "email-hash-1",
            saltVersion: 3,
          }),
        ]),
      });
    });

    it("skips upsert when no hashes are provided", async () => {
      const activeSalt = makeSalt();
      saltRepo.findActive = vi.fn().mockResolvedValue(activeSalt);

      await service.updateUserHashes({
        userId: "user-1",
        phoneHashes: [],
        emailHashes: [],
      });

      expect(contactsRepo.upsertHashes).not.toHaveBeenCalled();
      expect(emailIndexRepo.upsertHashes).not.toHaveBeenCalled();
    });

    it("bootstraps salt if none exists before updating hashes", async () => {
      saltRepo.findActive = vi.fn().mockResolvedValue(null);
      saltRepo.getLatestVersion = vi.fn().mockResolvedValue(0);

      await service.updateUserHashes({
        userId: "user-1",
        phoneHashes: [{ hash: "hash-1" }],
        emailHashes: [],
      });

      expect(keyProvider.generateKey).toHaveBeenCalledOnce();
      expect(saltRepo.create).toHaveBeenCalledOnce();
      expect(contactsRepo.upsertHashes).toHaveBeenCalled();
    });
  });
});
