import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import { HandleService, HANDLE_HISTORY_RETENTION_YEARS, RESERVED_HANDLES } from "./services";
import type { HandleHistoryRepository, ProfileRepository } from "./ports";
import type { HandleHistory, Profile } from "./types";

function makeProfile(overrides?: Partial<Profile>): Profile {
  const now = new Date();
  return {
    id: "00000000-0000-0000-0000-000000000001",
    handle: "testuser",
    displayName: "Test User",
    defaultVisibility: "public",
    createdAt: now,
    updatedAt: now,
    version: 1,
    ...overrides,
  } as Profile;
}

function makeProfileRepo(overrides?: Partial<ProfileRepository>): ProfileRepository {
  return {
    findById: vi.fn().mockResolvedValue(null),
    findByHandle: vi.fn(),
    create: vi.fn(),
    isHandleTaken: vi.fn().mockResolvedValue(false),
    setHandle: vi.fn().mockResolvedValue(makeProfile()),
    ...overrides,
  };
}

function makeHandleHistoryRepo(overrides?: Partial<HandleHistoryRepository>): HandleHistoryRepository {
  return {
    record: vi.fn().mockResolvedValue({} as HandleHistory),
    findByOldHandle: vi.fn().mockResolvedValue(null),
    deleteExpired: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeService(
  profileRepo?: Partial<ProfileRepository>,
  historyRepo?: Partial<HandleHistoryRepository>
): HandleService {
  return new HandleService(makeProfileRepo(profileRepo), makeHandleHistoryRepo(historyRepo));
}

describe("HandleService", () => {
  describe("isReserved", () => {
    it("returns true for 'admin'", () => {
      const svc = makeService();
      expect(svc.isReserved("admin")).toBe(true);
    });

    it("returns true for 'root'", () => {
      const svc = makeService();
      expect(svc.isReserved("root")).toBe(true);
    });

    it("is case-insensitive for reserved check", () => {
      const svc = makeService();
      expect(svc.isReserved("ADMIN")).toBe(true);
      expect(svc.isReserved("Admin")).toBe(true);
    });

    it("returns false for a normal handle", () => {
      const svc = makeService();
      expect(svc.isReserved("bookworm42")).toBe(false);
    });

    it("property: every reserved handle in the set is detected as reserved", () => {
      const svc = makeService();
      for (const h of RESERVED_HANDLES) {
        expect(svc.isReserved(h)).toBe(true);
        expect(svc.isReserved(h.toUpperCase())).toBe(true);
      }
    });
  });

  describe("isAvailable", () => {
    it("returns false for a reserved handle", async () => {
      const profileRepo = makeProfileRepo({ isHandleTaken: vi.fn() });
      const svc = new HandleService(profileRepo, makeHandleHistoryRepo());
      expect(await svc.isAvailable("admin")).toBe(false);
      expect(profileRepo.isHandleTaken).not.toHaveBeenCalled();
    });

    it("returns false when repo says handle is taken", async () => {
      const svc = makeService({ isHandleTaken: vi.fn().mockResolvedValue(true) });
      expect(await svc.isAvailable("bookworm42")).toBe(false);
    });

    it("returns true when handle is free and not reserved", async () => {
      const svc = makeService({ isHandleTaken: vi.fn().mockResolvedValue(false) });
      expect(await svc.isAvailable("bookworm42")).toBe(true);
    });

    it("lowercases handle before checking repo", async () => {
      const profileRepo = makeProfileRepo({ isHandleTaken: vi.fn().mockResolvedValue(false) });
      const svc = new HandleService(profileRepo, makeHandleHistoryRepo());
      await svc.isAvailable("BookWorm42");
      expect(profileRepo.isHandleTaken).toHaveBeenCalledWith("bookworm42");
    });
  });

  describe("checkHandle", () => {
    it("returns available=true and empty suggestions when handle is free", async () => {
      const svc = makeService({ isHandleTaken: vi.fn().mockResolvedValue(false) });
      const result = await svc.checkHandle("bookworm42");
      expect(result.available).toBe(true);
      expect(result.suggestions).toHaveLength(0);
    });

    it("returns available=false and suggestions when handle is taken", async () => {
      const svc = makeService({ isHandleTaken: vi.fn().mockResolvedValue(true) });
      const result = await svc.checkHandle("bookworm42");
      expect(result.available).toBe(false);
      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    it("suggestions are all within valid length bounds", async () => {
      const svc = makeService({ isHandleTaken: vi.fn().mockResolvedValue(true) });
      const result = await svc.checkHandle("bookworm42");
      for (const s of result.suggestions) {
        expect(s.length).toBeGreaterThanOrEqual(3);
        expect(s.length).toBeLessThanOrEqual(30);
      }
    });

    it("returns available=false for reserved handle", async () => {
      const svc = makeService();
      const result = await svc.checkHandle("admin");
      expect(result.available).toBe(false);
      expect(result.suggestions.length).toBeGreaterThan(0);
    });
  });

  describe("setHandle", () => {
    it("calls repo.setHandle with lowercased handle when available", async () => {
      const profile = makeProfile({ handle: "bookworm42" });
      const profileRepo = makeProfileRepo({
        isHandleTaken: vi.fn().mockResolvedValue(false),
        setHandle: vi.fn().mockResolvedValue(profile),
      });
      const svc = new HandleService(profileRepo, makeHandleHistoryRepo());
      const result = await svc.setHandle("00000000-0000-0000-0000-000000000001", "BookWorm42");
      expect(profileRepo.setHandle).toHaveBeenCalledWith({
        userId: "00000000-0000-0000-0000-000000000001",
        handle: "bookworm42",
      });
      expect(result).toEqual(profile);
    });

    it("throws with HANDLE_TAKEN code when handle is not available", async () => {
      const svc = makeService({ isHandleTaken: vi.fn().mockResolvedValue(true) });
      await expect(svc.setHandle("00000000-0000-0000-0000-000000000001", "bookworm42")).rejects.toMatchObject({
        code: "HANDLE_TAKEN",
      });
    });

    it("throws with suggestions when handle is not available", async () => {
      const svc = makeService({ isHandleTaken: vi.fn().mockResolvedValue(true) });
      await expect(svc.setHandle("00000000-0000-0000-0000-000000000001", "bookworm42")).rejects.toMatchObject({
        suggestions: expect.arrayContaining([expect.any(String)]),
      });
    });

    it("records old handle in history when handle changes", async () => {
      const existing = makeProfile({ handle: "oldhandle" });
      const updated = makeProfile({ handle: "newhandle" });
      const historyRecord = vi.fn().mockResolvedValue({} as HandleHistory);
      const profileRepo = makeProfileRepo({
        findById: vi.fn().mockResolvedValue(existing),
        isHandleTaken: vi.fn().mockResolvedValue(false),
        setHandle: vi.fn().mockResolvedValue(updated),
      });
      const historyRepo = makeHandleHistoryRepo({ record: historyRecord });
      const svc = new HandleService(profileRepo, historyRepo);
      await svc.setHandle(existing.id, "newhandle");
      expect(historyRecord).toHaveBeenCalledWith(
        expect.objectContaining({ profileId: existing.id, oldHandle: "oldhandle" })
      );
    });

    it("does not record history when user has no existing handle", async () => {
      const historyRecord = vi.fn().mockResolvedValue({} as HandleHistory);
      const profileRepo = makeProfileRepo({
        findById: vi.fn().mockResolvedValue(null),
        isHandleTaken: vi.fn().mockResolvedValue(false),
      });
      const historyRepo = makeHandleHistoryRepo({ record: historyRecord });
      const svc = new HandleService(profileRepo, historyRepo);
      await svc.setHandle("00000000-0000-0000-0000-000000000001", "newhandle");
      expect(historyRecord).not.toHaveBeenCalled();
    });

    it("does not record history when handle is unchanged", async () => {
      const existing = makeProfile({ handle: "samehandle" });
      const historyRecord = vi.fn().mockResolvedValue({} as HandleHistory);
      const profileRepo = makeProfileRepo({
        findById: vi.fn().mockResolvedValue(existing),
        isHandleTaken: vi.fn().mockResolvedValue(false),
        setHandle: vi.fn().mockResolvedValue(existing),
      });
      const historyRepo = makeHandleHistoryRepo({ record: historyRecord });
      const svc = new HandleService(profileRepo, historyRepo);
      await svc.setHandle(existing.id, "samehandle");
      expect(historyRecord).not.toHaveBeenCalled();
    });

    it("sets handle history expiry to HANDLE_HISTORY_RETENTION_YEARS years in the future", async () => {
      const existing = makeProfile({ handle: "oldhandle" });
      const updated = makeProfile({ handle: "newhandle" });
      const historyRecord = vi.fn().mockResolvedValue({} as HandleHistory);
      const profileRepo = makeProfileRepo({
        findById: vi.fn().mockResolvedValue(existing),
        isHandleTaken: vi.fn().mockResolvedValue(false),
        setHandle: vi.fn().mockResolvedValue(updated),
      });
      const historyRepo = makeHandleHistoryRepo({ record: historyRecord });
      const before = new Date();
      const svc = new HandleService(profileRepo, historyRepo);
      await svc.setHandle(existing.id, "newhandle");
      const after = new Date();
      const call = historyRecord.mock.calls[0];
      if (!call) throw new Error("record was not called");
      const { expiresAt } = call[0] as { expiresAt: Date };
      const minExpiry = new Date(before);
      minExpiry.setFullYear(minExpiry.getFullYear() + HANDLE_HISTORY_RETENTION_YEARS);
      const maxExpiry = new Date(after);
      maxExpiry.setFullYear(maxExpiry.getFullYear() + HANDLE_HISTORY_RETENTION_YEARS);
      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(minExpiry.getTime());
      expect(expiresAt.getTime()).toBeLessThanOrEqual(maxExpiry.getTime());
    });
  });

  describe("property tests", () => {
    it("reserved handles are always unavailable regardless of repo response", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...Array.from(RESERVED_HANDLES)),
          async (handle) => {
            const svc = makeService({ isHandleTaken: vi.fn().mockResolvedValue(false) });
            const result = await svc.checkHandle(handle);
            return result.available === false;
          }
        )
      );
    });

    it("suggestions are always within valid handle length constraints", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.stringMatching(/^[a-z][a-z0-9]{2,15}$/),
          async (base) => {
            const svc = makeService({ isHandleTaken: vi.fn().mockResolvedValue(true) });
            const result = await svc.checkHandle(base);
            return result.suggestions.every((s) => s.length >= 3 && s.length <= 30);
          }
        )
      );
    });
  });
});
