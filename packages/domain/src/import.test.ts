import { describe, it, expect, vi } from "vitest";
import * as fc from "fast-check";
import { createHash } from "node:crypto";
import {
  ImportService,
  hashFileContent,
  VALID_STATUS_TRANSITIONS,
} from "./services";
import type { ImportRepository } from "./ports";
import type { Import, ImportStatus } from "./types";

function makeImport(overrides?: Partial<Import>): Import {
  const now = new Date();
  return {
    id: "00000000-0000-0000-0000-000000000001",
    ownerId: "00000000-0000-0000-0000-000000000002",
    source: "goodreads",
    idempotencyHash: "abc123",
    conflictCount: 0,
    status: "pending",
    createdAt: now,
    ...overrides,
  };
}

function makeImportRepository(overrides?: Partial<ImportRepository>): ImportRepository {
  return {
    create: vi.fn().mockResolvedValue(makeImport()),
    findById: vi.fn().mockResolvedValue(null),
    findByOwnerAndHash: vi.fn().mockResolvedValue(null),
    listByOwner: vi.fn().mockResolvedValue([]),
    updateStatus: vi.fn().mockResolvedValue(makeImport()),
    ...overrides,
  };
}

describe("hashFileContent", () => {
  it("returns a hex sha256 of the input string", () => {
    const content = "Book Id,Title\n1,Dune";
    const expected = createHash("sha256").update(content).digest("hex");
    expect(hashFileContent(content)).toBe(expected);
  });

  it("is deterministic for the same input", () => {
    const content = "some csv content";
    expect(hashFileContent(content)).toBe(hashFileContent(content));
  });

  it("produces different hashes for different inputs", () => {
    expect(hashFileContent("file a")).not.toBe(hashFileContent("file b"));
  });

  it("accepts Uint8Array input", () => {
    const bytes = new TextEncoder().encode("hello");
    const expected = createHash("sha256").update(bytes).digest("hex");
    expect(hashFileContent(bytes)).toBe(expected);
  });
});

describe("VALID_STATUS_TRANSITIONS", () => {
  it("pending can transition to processing or failed", () => {
    expect(VALID_STATUS_TRANSITIONS.pending).toContain("processing");
    expect(VALID_STATUS_TRANSITIONS.pending).toContain("failed");
  });

  it("processing can transition to needs_review, completed, or failed", () => {
    expect(VALID_STATUS_TRANSITIONS.processing).toContain("needs_review");
    expect(VALID_STATUS_TRANSITIONS.processing).toContain("completed");
    expect(VALID_STATUS_TRANSITIONS.processing).toContain("failed");
  });

  it("completed has no valid transitions", () => {
    expect(VALID_STATUS_TRANSITIONS.completed).toHaveLength(0);
  });

  it("failed has no valid transitions", () => {
    expect(VALID_STATUS_TRANSITIONS.failed).toHaveLength(0);
  });
});

describe("ImportService.createImport", () => {
  it("hashes file content and stores as idempotencyHash", async () => {
    const repo = makeImportRepository();
    const service = new ImportService(repo);
    const content = "Book Id,Title\n1,Dune";
    const expectedHash = hashFileContent(content);

    await service.createImport({
      id: "00000000-0000-0000-0000-000000000001",
      ownerId: "00000000-0000-0000-0000-000000000002",
      source: "goodreads",
      fileContent: content,
    });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyHash: expectedHash })
    );
  });

  it("returns duplicate=false for new file", async () => {
    const repo = makeImportRepository({
      findByOwnerAndHash: vi.fn().mockResolvedValue(null),
    });
    const service = new ImportService(repo);
    const result = await service.createImport({
      id: "00000000-0000-0000-0000-000000000001",
      ownerId: "00000000-0000-0000-0000-000000000002",
      source: "goodreads",
      fileContent: "some content",
    });
    expect(result.duplicate).toBe(false);
  });

  it("returns duplicate=true and existing import when hash matches", async () => {
    const existing = makeImport({ idempotencyHash: hashFileContent("same content") });
    const repo = makeImportRepository({
      findByOwnerAndHash: vi.fn().mockResolvedValue(existing),
    });
    const service = new ImportService(repo);
    const result = await service.createImport({
      id: "00000000-0000-0000-0000-000000000099",
      ownerId: "00000000-0000-0000-0000-000000000002",
      source: "goodreads",
      fileContent: "same content",
    });
    expect(result.duplicate).toBe(true);
    expect(result.import).toBe(existing);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("checks hash scoped to the owner", async () => {
    const repo = makeImportRepository();
    const service = new ImportService(repo);
    const ownerId = "00000000-0000-0000-0000-000000000002";
    const content = "file content";
    await service.createImport({
      id: "00000000-0000-0000-0000-000000000001",
      ownerId,
      source: "goodreads",
      fileContent: content,
    });
    expect(repo.findByOwnerAndHash).toHaveBeenCalledWith({
      ownerId,
      hash: hashFileContent(content),
    });
  });
});

describe("ImportService.transitionStatus", () => {
  it("transitions from pending to processing", async () => {
    const existing = makeImport({ status: "pending" });
    const updated = makeImport({ status: "processing" });
    const repo = makeImportRepository({
      findById: vi.fn().mockResolvedValue(existing),
      updateStatus: vi.fn().mockResolvedValue(updated),
    });
    const service = new ImportService(repo);
    const result = await service.transitionStatus({
      id: existing.id,
      toStatus: "processing",
    });
    expect(result.status).toBe("processing");
    expect(repo.updateStatus).toHaveBeenCalledWith(
      expect.objectContaining({ id: existing.id, status: "processing" })
    );
  });

  it("throws IMPORT_NOT_FOUND when import does not exist", async () => {
    const repo = makeImportRepository({
      findById: vi.fn().mockResolvedValue(null),
    });
    const service = new ImportService(repo);
    await expect(
      service.transitionStatus({ id: "nonexistent", toStatus: "processing" })
    ).rejects.toMatchObject({ code: "IMPORT_NOT_FOUND" });
  });

  it("throws INVALID_STATUS_TRANSITION for illegal transitions", async () => {
    const existing = makeImport({ status: "completed" });
    const repo = makeImportRepository({
      findById: vi.fn().mockResolvedValue(existing),
    });
    const service = new ImportService(repo);
    await expect(
      service.transitionStatus({ id: existing.id, toStatus: "processing" })
    ).rejects.toMatchObject({ code: "INVALID_STATUS_TRANSITION" });
  });

  it("sets completedAt when transitioning to completed", async () => {
    const existing = makeImport({ status: "processing" });
    const repo = makeImportRepository({
      findById: vi.fn().mockResolvedValue(existing),
      updateStatus: vi.fn().mockResolvedValue(makeImport({ status: "completed" })),
    });
    const service = new ImportService(repo);
    await service.transitionStatus({ id: existing.id, toStatus: "completed" });
    expect(repo.updateStatus).toHaveBeenCalledWith(
      expect.objectContaining({ completedAt: expect.any(Date) })
    );
  });

  it("sets completedAt when transitioning to failed", async () => {
    const existing = makeImport({ status: "processing" });
    const repo = makeImportRepository({
      findById: vi.fn().mockResolvedValue(existing),
      updateStatus: vi.fn().mockResolvedValue(makeImport({ status: "failed" })),
    });
    const service = new ImportService(repo);
    await service.transitionStatus({ id: existing.id, toStatus: "failed" });
    expect(repo.updateStatus).toHaveBeenCalledWith(
      expect.objectContaining({ completedAt: expect.any(Date) })
    );
  });

  it("does not set completedAt for intermediate transitions", async () => {
    const existing = makeImport({ status: "pending" });
    const repo = makeImportRepository({
      findById: vi.fn().mockResolvedValue(existing),
      updateStatus: vi.fn().mockResolvedValue(makeImport({ status: "processing" })),
    });
    const service = new ImportService(repo);
    await service.transitionStatus({ id: existing.id, toStatus: "processing" });
    expect(repo.updateStatus).toHaveBeenCalledWith(
      expect.objectContaining({ completedAt: undefined })
    );
  });
});

describe("property tests", () => {
  it("hashFileContent always returns a 64-character hex string", () => {
    fc.assert(
      fc.property(fc.string(), (content) => {
        const hash = hashFileContent(content);
        return /^[0-9a-f]{64}$/.test(hash);
      })
    );
  });

  it("hashFileContent is deterministic for the same input", () => {
    fc.assert(
      fc.property(fc.string(), (content) => {
        return hashFileContent(content) === hashFileContent(content);
      })
    );
  });

  it("VALID_STATUS_TRANSITIONS never allows completed or failed as a source", () => {
    const terminalStatuses: ImportStatus[] = ["completed", "failed"];
    for (const status of terminalStatuses) {
      expect(VALID_STATUS_TRANSITIONS[status]).toHaveLength(0);
    }
  });
});
