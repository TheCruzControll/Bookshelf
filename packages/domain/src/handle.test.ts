import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import { HandleService, RESERVED_HANDLES } from "./services";
import type { ProfileRepository } from "./ports";
import type { Profile } from "./types";

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
    findById: vi.fn(),
    findByHandle: vi.fn(),
    create: vi.fn(),
    isHandleTaken: vi.fn().mockResolvedValue(false),
    setHandle: vi.fn().mockResolvedValue(makeProfile()),
    ...overrides,
  };
}

describe("HandleService", () => {
  describe("isReserved", () => {
    it("returns true for 'admin'", () => {
      const svc = new HandleService(makeProfileRepo());
      expect(svc.isReserved("admin")).toBe(true);
    });

    it("returns true for 'root'", () => {
      const svc = new HandleService(makeProfileRepo());
      expect(svc.isReserved("root")).toBe(true);
    });

    it("is case-insensitive for reserved check", () => {
      const svc = new HandleService(makeProfileRepo());
      expect(svc.isReserved("ADMIN")).toBe(true);
      expect(svc.isReserved("Admin")).toBe(true);
    });

    it("returns false for a normal handle", () => {
      const svc = new HandleService(makeProfileRepo());
      expect(svc.isReserved("bookworm42")).toBe(false);
    });

    it("property: every reserved handle in the set is detected as reserved", () => {
      const svc = new HandleService(makeProfileRepo());
      for (const h of RESERVED_HANDLES) {
        expect(svc.isReserved(h)).toBe(true);
        expect(svc.isReserved(h.toUpperCase())).toBe(true);
      }
    });
  });

  describe("isAvailable", () => {
    it("returns false for a reserved handle", async () => {
      const repo = makeProfileRepo({ isHandleTaken: vi.fn() });
      const svc = new HandleService(repo);
      expect(await svc.isAvailable("admin")).toBe(false);
      expect(repo.isHandleTaken).not.toHaveBeenCalled();
    });

    it("returns false when repo says handle is taken", async () => {
      const repo = makeProfileRepo({ isHandleTaken: vi.fn().mockResolvedValue(true) });
      const svc = new HandleService(repo);
      expect(await svc.isAvailable("bookworm42")).toBe(false);
    });

    it("returns true when handle is free and not reserved", async () => {
      const repo = makeProfileRepo({ isHandleTaken: vi.fn().mockResolvedValue(false) });
      const svc = new HandleService(repo);
      expect(await svc.isAvailable("bookworm42")).toBe(true);
    });

    it("lowercases handle before checking repo", async () => {
      const repo = makeProfileRepo({ isHandleTaken: vi.fn().mockResolvedValue(false) });
      const svc = new HandleService(repo);
      await svc.isAvailable("BookWorm42");
      expect(repo.isHandleTaken).toHaveBeenCalledWith("bookworm42");
    });
  });

  describe("checkHandle", () => {
    it("returns available=true and empty suggestions when handle is free", async () => {
      const svc = new HandleService(makeProfileRepo({ isHandleTaken: vi.fn().mockResolvedValue(false) }));
      const result = await svc.checkHandle("bookworm42");
      expect(result.available).toBe(true);
      expect(result.suggestions).toHaveLength(0);
    });

    it("returns available=false and suggestions when handle is taken", async () => {
      const svc = new HandleService(makeProfileRepo({ isHandleTaken: vi.fn().mockResolvedValue(true) }));
      const result = await svc.checkHandle("bookworm42");
      expect(result.available).toBe(false);
      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    it("suggestions are all within valid length bounds", async () => {
      const svc = new HandleService(makeProfileRepo({ isHandleTaken: vi.fn().mockResolvedValue(true) }));
      const result = await svc.checkHandle("bookworm42");
      for (const s of result.suggestions) {
        expect(s.length).toBeGreaterThanOrEqual(3);
        expect(s.length).toBeLessThanOrEqual(30);
      }
    });

    it("returns available=false for reserved handle", async () => {
      const svc = new HandleService(makeProfileRepo());
      const result = await svc.checkHandle("admin");
      expect(result.available).toBe(false);
      expect(result.suggestions.length).toBeGreaterThan(0);
    });
  });

  describe("setHandle", () => {
    it("calls repo.setHandle with lowercased handle when available", async () => {
      const profile = makeProfile({ handle: "bookworm42" });
      const repo = makeProfileRepo({
        isHandleTaken: vi.fn().mockResolvedValue(false),
        setHandle: vi.fn().mockResolvedValue(profile),
      });
      const svc = new HandleService(repo);
      const result = await svc.setHandle("00000000-0000-0000-0000-000000000001", "BookWorm42");
      expect(repo.setHandle).toHaveBeenCalledWith({
        userId: "00000000-0000-0000-0000-000000000001",
        handle: "bookworm42",
      });
      expect(result).toEqual(profile);
    });

    it("throws with HANDLE_TAKEN code when handle is not available", async () => {
      const repo = makeProfileRepo({ isHandleTaken: vi.fn().mockResolvedValue(true) });
      const svc = new HandleService(repo);
      await expect(svc.setHandle("00000000-0000-0000-0000-000000000001", "bookworm42")).rejects.toMatchObject({
        code: "HANDLE_TAKEN",
      });
    });

    it("throws with suggestions when handle is not available", async () => {
      const repo = makeProfileRepo({ isHandleTaken: vi.fn().mockResolvedValue(true) });
      const svc = new HandleService(repo);
      await expect(svc.setHandle("00000000-0000-0000-0000-000000000001", "bookworm42")).rejects.toMatchObject({
        suggestions: expect.arrayContaining([expect.any(String)]),
      });
    });
  });

  describe("property tests", () => {
    it("reserved handles are always unavailable regardless of repo response", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...Array.from(RESERVED_HANDLES)),
          async (handle) => {
            const repo = makeProfileRepo({ isHandleTaken: vi.fn().mockResolvedValue(false) });
            const svc = new HandleService(repo);
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
            const repo = makeProfileRepo({ isHandleTaken: vi.fn().mockResolvedValue(true) });
            const svc = new HandleService(repo);
            const result = await svc.checkHandle(base);
            return result.suggestions.every((s) => s.length >= 3 && s.length <= 30);
          }
        )
      );
    });
  });
});
