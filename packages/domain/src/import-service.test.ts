import { describe, it, expect, vi, beforeEach } from "vitest";
import { ImportService, REUPLOAD_OPTIONS } from "./services";
import type { ImportRepository } from "./ports";
import type { Import } from "./types";

const UUID1 = "00000000-0000-0000-0000-000000000001";
const UUID2 = "00000000-0000-0000-0000-000000000002";
const NOW = new Date();
const HASH_A = "a".repeat(64);

function makeImport(overrides?: Partial<Import>): Import {
  return {
    id: UUID2,
    ownerId: UUID1,
    source: "goodreads",
    idempotencyHash: HASH_A,
    conflictCount: 0,
    status: "completed",
    createdAt: NOW,
    ...overrides,
  };
}

function makeImportRepository(overrides?: Partial<ImportRepository>): ImportRepository {
  return {
    create: vi.fn().mockResolvedValue(makeImport()),
    findById: vi.fn().mockResolvedValue(null),
    findByOwnerAndHash: vi.fn().mockResolvedValue(null),
    listByOwner: vi.fn().mockResolvedValue([]),
    updateStatus: vi.fn().mockResolvedValue(makeImport({ status: "processing" })),
    ...overrides,
  };
}

describe("ImportService", () => {
  describe("checkForDuplicate", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("returns isDuplicate: false when no previous import matches the hash", async () => {
      const repo = makeImportRepository();
      const service = new ImportService(repo);

      const result = await service.checkForDuplicate({
        ownerId: UUID1,
        fileHash: HASH_A,
      });

      expect(result.isDuplicate).toBe(false);
      expect(result.existingImportId).toBeUndefined();
      expect(result.options).toBeUndefined();
    });

    it("returns isDuplicate: true with existingImportId and options on match", async () => {
      const existing = makeImport();
      const repo = makeImportRepository({
        findByOwnerAndHash: vi.fn().mockResolvedValue(existing),
      });
      const service = new ImportService(repo);

      const result = await service.checkForDuplicate({
        ownerId: UUID1,
        fileHash: HASH_A,
      });

      expect(result.isDuplicate).toBe(true);
      expect(result.existingImportId).toBe(UUID2);
      expect(result.options).toEqual(REUPLOAD_OPTIONS);
    });

    it("returns exactly three options: process_from_scratch, merge_changes_only, cancel", async () => {
      const repo = makeImportRepository({
        findByOwnerAndHash: vi.fn().mockResolvedValue(makeImport()),
      });
      const service = new ImportService(repo);

      const result = await service.checkForDuplicate({
        ownerId: UUID1,
        fileHash: HASH_A,
      });

      expect(result.options).toHaveLength(3);
      expect(result.options).toContain("process_from_scratch");
      expect(result.options).toContain("merge_changes_only");
      expect(result.options).toContain("cancel");
    });

    it("queries the repository with the correct ownerId and hash", async () => {
      const repo = makeImportRepository();
      const service = new ImportService(repo);

      await service.checkForDuplicate({
        ownerId: UUID1,
        fileHash: HASH_A,
      });

      expect(repo.findByOwnerAndHash).toHaveBeenCalledWith({
        ownerId: UUID1,
        hash: HASH_A,
      });
    });
  });

  describe("confirmReupload", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("returns cancelled status when strategy is cancel", async () => {
      const repo = makeImportRepository();
      const service = new ImportService(repo);

      const result = await service.confirmReupload({
        ownerId: UUID1,
        fileHash: HASH_A,
        strategy: "cancel",
      });

      expect(result.status).toBe("cancelled");
      expect(result.importId).toBeUndefined();
      expect(repo.create).not.toHaveBeenCalled();
    });

    it("creates a new import record when strategy is process_from_scratch", async () => {
      const repo = makeImportRepository();
      const service = new ImportService(repo);

      const result = await service.confirmReupload({
        ownerId: UUID1,
        fileHash: HASH_A,
        strategy: "process_from_scratch",
      });

      expect(result.status).toBe("created");
      expect(result.importId).toBeDefined();
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerId: UUID1,
          source: "goodreads",
          idempotencyHash: HASH_A,
        })
      );
    });

    it("does not transition to processing when strategy is process_from_scratch", async () => {
      const repo = makeImportRepository();
      const service = new ImportService(repo);

      await service.confirmReupload({
        ownerId: UUID1,
        fileHash: HASH_A,
        strategy: "process_from_scratch",
      });

      expect(repo.updateStatus).not.toHaveBeenCalled();
    });

    it("creates a new import and transitions to processing when strategy is merge_changes_only", async () => {
      const created = makeImport({ status: "pending" });
      const repo = makeImportRepository({
        create: vi.fn().mockResolvedValue(created),
      });
      const service = new ImportService(repo);

      const result = await service.confirmReupload({
        ownerId: UUID1,
        fileHash: HASH_A,
        strategy: "merge_changes_only",
      });

      expect(result.status).toBe("created");
      expect(repo.create).toHaveBeenCalled();
      expect(repo.updateStatus).toHaveBeenCalledWith({
        id: created.id,
        status: "processing",
      });
    });

    it("returns the created import id for process_from_scratch", async () => {
      const repo = makeImportRepository({
        create: vi.fn().mockResolvedValue(makeImport({ id: UUID2 })),
      });
      const service = new ImportService(repo);

      const result = await service.confirmReupload({
        ownerId: UUID1,
        fileHash: HASH_A,
        strategy: "process_from_scratch",
      });

      expect(result.importId).toBe(UUID2);
    });

    it("returns the created import id for merge_changes_only", async () => {
      const repo = makeImportRepository({
        create: vi.fn().mockResolvedValue(makeImport({ id: UUID2 })),
      });
      const service = new ImportService(repo);

      const result = await service.confirmReupload({
        ownerId: UUID1,
        fileHash: HASH_A,
        strategy: "merge_changes_only",
      });

      expect(result.importId).toBe(UUID2);
    });
  });
});
