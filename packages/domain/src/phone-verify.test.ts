import { describe, it, expect, vi, beforeEach } from "vitest";
import { PhoneVerifyService } from "./services";
import type {
  BlockRepository,
  PhoneVerificationRepository,
  PhoneNumberRepository,
  SmsProvider,
} from "./ports";

vi.mock("@hone/observability", () => ({
  captureException: vi.fn(),
  createLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn() })),
  initSentry: vi.fn(),
  setSentryUser: vi.fn(),
  clearSentryUser: vi.fn(),
}));

function makePhoneVerificationRepo(): PhoneVerificationRepository {
  return {
    upsert: vi.fn().mockImplementation(async (input) => ({
      phoneE164: input.phoneE164,
      codeHash: input.codeHash,
      attempts: input.attempts,
      expiresAt: input.expiresAt,
    })),
    findByPhone: vi.fn().mockResolvedValue(null),
    incrementAttempts: vi.fn().mockImplementation(async (phone) => ({
      phoneE164: phone,
      codeHash: "hash",
      attempts: 1,
      expiresAt: new Date(Date.now() + 600_000),
    })),
    deleteByPhone: vi.fn(),
    deleteExpired: vi.fn(),
  };
}

function makePhoneNumberRepo(): PhoneNumberRepository {
  return {
    upsert: vi.fn().mockImplementation(async (input) => ({
      profileId: input.profileId,
      e164Hash: input.e164Hash,
    })),
    findByProfileId: vi.fn().mockResolvedValue(null),
    findByHash: vi.fn().mockResolvedValue(null),
  };
}

function makeSmsProvider(): SmsProvider {
  return {
    sendVerificationCode: vi.fn(),
  };
}

function makeCache() {
  const store = new Map<string, { value: number; expiresAt: number }>();
  return {
    get: vi.fn(async (key: string) => {
      const entry = store.get(key);
      if (!entry || entry.expiresAt < Date.now()) return null;
      return entry.value;
    }),
    set: vi.fn(async (key: string, value: number, ttl: number) => {
      store.set(key, { value, expiresAt: Date.now() + ttl });
    }),
    _store: store,
  };
}

const PROFILE_ID = "00000000-0000-0000-0000-000000000001";

describe("PhoneVerifyService", () => {
  let phoneVerifRepo: PhoneVerificationRepository;
  let phoneNumRepo: PhoneNumberRepository;
  let smsProvider: SmsProvider;
  let service: PhoneVerifyService;

  beforeEach(() => {
    vi.clearAllMocks();
    phoneVerifRepo = makePhoneVerificationRepo();
    phoneNumRepo = makePhoneNumberRepo();
    smsProvider = makeSmsProvider();
    service = new PhoneVerifyService(phoneVerifRepo, phoneNumRepo, smsProvider);
  });

  describe("normalizePhone", () => {
    it("normalizes a valid US phone to E.164", () => {
      const result = service.normalizePhone("+1 (202) 555-1234");
      expect(result).toBe("+12025551234");
    });

    it("normalizes a valid UK phone to E.164", () => {
      const result = service.normalizePhone("+44 7911 123456");
      expect(result).toBe("+447911123456");
    });

    it("throws INVALID_PHONE for an invalid number", () => {
      expect(() => service.normalizePhone("not-a-phone")).toThrow();
      try {
        service.normalizePhone("not-a-phone");
      } catch (err) {
        expect((err as Error & { code: string }).code).toBe("INVALID_PHONE");
      }
    });

    it("throws INVALID_PHONE for an empty string", () => {
      expect(() => service.normalizePhone("")).toThrow();
    });
  });

  describe("generateCode", () => {
    it("generates a 6-digit string", () => {
      const code = service.generateCode();
      expect(code).toMatch(/^\d{6}$/);
    });

    it("pads short codes with leading zeros", () => {
      const code = service.generateCode();
      expect(code.length).toBe(6);
    });
  });

  describe("startVerification", () => {
    it("normalizes, generates code, stores hash, sends SMS", async () => {
      const result = await service.startVerification("+1 (202) 555-1234");

      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(phoneVerifRepo.upsert).toHaveBeenCalledTimes(1);
      expect(smsProvider.sendVerificationCode).toHaveBeenCalledTimes(1);

      // The SMS should be sent to the E.164 number
      const smsCall = (smsProvider.sendVerificationCode as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(smsCall.to).toBe("+12025551234");
      expect(smsCall.code).toMatch(/^\d{6}$/);
    });

    it("throws INVALID_PHONE for invalid numbers", async () => {
      await expect(service.startVerification("abc")).rejects.toThrow("Invalid phone number");
    });

    it("rate-limits after 5 starts per phone per window (SMS pumping protection)", async () => {
      const cache = makeCache();

      // First 5 should succeed
      for (let i = 0; i < 5; i++) {
        await service.startVerification("+12025551234", cache);
      }

      // 6th should be rate-limited
      await expect(service.startVerification("+12025551234", cache)).rejects.toThrow(
        "Too many verification attempts"
      );

      try {
        await service.startVerification("+12025551234", cache);
      } catch (err) {
        expect((err as Error & { code: string }).code).toBe("RATE_LIMITED");
      }
    });
  });

  describe("confirmVerification", () => {
    it("verifies correct code and links phone to profile", async () => {
      // Start verification first
      await service.startVerification("+12025551234");

      // Get the code that was sent
      const smsCall = (smsProvider.sendVerificationCode as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      const code = smsCall.code;

      // Get the code hash that was stored
      const upsertCall = (phoneVerifRepo.upsert as ReturnType<typeof vi.fn>).mock.calls[0]![0];

      // Mock findByPhone to return the stored verification
      (phoneVerifRepo.findByPhone as ReturnType<typeof vi.fn>).mockResolvedValue({
        phoneE164: "+12025551234",
        codeHash: upsertCall.codeHash,
        attempts: 0,
        expiresAt: new Date(Date.now() + 600_000),
      });

      const result = await service.confirmVerification("+12025551234", code, PROFILE_ID);
      expect(result.verified).toBe(true);
      expect(phoneNumRepo.upsert).toHaveBeenCalledTimes(1);
      expect(phoneVerifRepo.deleteByPhone).toHaveBeenCalledWith("+12025551234");
    });

    it("throws NOT_FOUND when no pending verification exists", async () => {
      (phoneVerifRepo.findByPhone as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(
        service.confirmVerification("+12025551234", "123456", PROFILE_ID)
      ).rejects.toThrow("No pending verification");

      try {
        await service.confirmVerification("+12025551234", "123456", PROFILE_ID);
      } catch (err) {
        expect((err as Error & { code: string }).code).toBe("NOT_FOUND");
      }
    });

    it("throws CODE_EXPIRED when verification has expired", async () => {
      (phoneVerifRepo.findByPhone as ReturnType<typeof vi.fn>).mockResolvedValue({
        phoneE164: "+12025551234",
        codeHash: "some-hash",
        attempts: 0,
        expiresAt: new Date(Date.now() - 1000), // expired
      });

      await expect(
        service.confirmVerification("+12025551234", "123456", PROFILE_ID)
      ).rejects.toThrow("Verification code expired");

      try {
        await service.confirmVerification("+12025551234", "123456", PROFILE_ID);
      } catch (err) {
        expect((err as Error & { code: string }).code).toBe("CODE_EXPIRED");
      }
    });

    it("throws RATE_LIMITED after 3 wrong attempts", async () => {
      (phoneVerifRepo.findByPhone as ReturnType<typeof vi.fn>).mockResolvedValue({
        phoneE164: "+12025551234",
        codeHash: "correct-hash",
        attempts: 3,
        expiresAt: new Date(Date.now() + 600_000),
      });

      await expect(
        service.confirmVerification("+12025551234", "000000", PROFILE_ID)
      ).rejects.toThrow("Too many failed attempts");

      try {
        await service.confirmVerification("+12025551234", "000000", PROFILE_ID);
      } catch (err) {
        expect((err as Error & { code: string }).code).toBe("RATE_LIMITED");
      }
    });

    it("throws INVALID_CODE and increments attempts for wrong code", async () => {
      (phoneVerifRepo.findByPhone as ReturnType<typeof vi.fn>).mockResolvedValue({
        phoneE164: "+12025551234",
        codeHash: "correct-hash",
        attempts: 0,
        expiresAt: new Date(Date.now() + 600_000),
      });

      await expect(
        service.confirmVerification("+12025551234", "000000", PROFILE_ID)
      ).rejects.toThrow("Invalid verification code");

      expect(phoneVerifRepo.incrementAttempts).toHaveBeenCalledWith("+12025551234");

      try {
        await service.confirmVerification("+12025551234", "000000", PROFILE_ID);
      } catch (err) {
        expect((err as Error & { code: string }).code).toBe("INVALID_CODE");
      }
    });

    it("throws INVALID_PHONE for invalid phone in confirm", async () => {
      await expect(
        service.confirmVerification("invalid", "123456", PROFILE_ID)
      ).rejects.toThrow("Invalid phone number");
    });
  });

  describe("confirmVerification — blocks_against_hash re-apply (#154)", () => {
    function makeBlockRepo(overrides: Partial<BlockRepository> = {}): BlockRepository {
      return {
        block: vi.fn(),
        unblock: vi.fn(),
        findBlock: vi.fn(),
        listBlockedByUser: vi.fn(),
        listBlockingUser: vi.fn(),
        isBlocked: vi.fn(),
        migrateBlocksAgainstToHash: vi.fn(),
        findAgainstHashEntries: vi.fn().mockResolvedValue([]),
        createMany: vi.fn().mockResolvedValue(0),
        ...overrides,
      };
    }

    async function primeValidCode(): Promise<string> {
      await service.startVerification("+12025551234");
      const smsCall = (smsProvider.sendVerificationCode as ReturnType<typeof vi.fn>)
        .mock.calls[0]![0];
      const upsertCall = (phoneVerifRepo.upsert as ReturnType<typeof vi.fn>)
        .mock.calls[0]![0];
      (phoneVerifRepo.findByPhone as ReturnType<typeof vi.fn>).mockResolvedValue({
        phoneE164: "+12025551234",
        codeHash: upsertCall.codeHash,
        attempts: 0,
        expiresAt: new Date(Date.now() + 600_000),
      });
      return smsCall.code;
    }

    it("re-applies blocks when blocks_against_hash matches new phone hash", async () => {
      const blockerA = "00000000-0000-0000-0000-0000000000aa";
      const blockerB = "00000000-0000-0000-0000-0000000000bb";
      const blocks = makeBlockRepo({
        findAgainstHashEntries: vi.fn().mockResolvedValue([
          { blockerId: blockerA, hash: "ignored", expiresAt: new Date(Date.now() + 1000) },
          { blockerId: blockerB, hash: "ignored", expiresAt: new Date(Date.now() + 1000) },
        ]),
      });
      service = new PhoneVerifyService(phoneVerifRepo, phoneNumRepo, smsProvider, blocks);

      const code = await primeValidCode();
      const result = await service.confirmVerification("+12025551234", code, PROFILE_ID);

      expect(result.verified).toBe(true);
      expect(blocks.findAgainstHashEntries).toHaveBeenCalledTimes(1);
      const findArg = (blocks.findAgainstHashEntries as ReturnType<typeof vi.fn>)
        .mock.calls[0]![0];
      expect(typeof findArg.targetHash).toBe("string");
      expect(findArg.targetHash.length).toBe(64); // sha256 hex
      expect(blocks.createMany).toHaveBeenCalledWith({
        blockerIds: [blockerA, blockerB],
        blockedId: PROFILE_ID,
      });
    });

    it("does NOT call createMany when no matching hash entries exist", async () => {
      const blocks = makeBlockRepo();
      service = new PhoneVerifyService(phoneVerifRepo, phoneNumRepo, smsProvider, blocks);

      const code = await primeValidCode();
      await service.confirmVerification("+12025551234", code, PROFILE_ID);

      expect(blocks.findAgainstHashEntries).toHaveBeenCalledTimes(1);
      expect(blocks.createMany).not.toHaveBeenCalled();
    });

    it("works without a BlockRepository (legacy callers)", async () => {
      service = new PhoneVerifyService(phoneVerifRepo, phoneNumRepo, smsProvider);
      const code = await primeValidCode();
      const result = await service.confirmVerification("+12025551234", code, PROFILE_ID);
      expect(result.verified).toBe(true);
    });
  });
});
