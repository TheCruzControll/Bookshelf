import { describe, it, expect, vi, beforeEach } from "vitest";
import { VersionConflictError, DrizzleProfileRepository, DrizzleShelfRepository, DrizzleReviewRepository } from "./repositories";

function makeDb(returning: unknown[]) {
  const chain = {
    update: vi.fn(),
    set: vi.fn(),
    where: vi.fn(),
    returning: vi.fn().mockResolvedValue(returning)
  };
  chain.update.mockReturnValue(chain);
  chain.set.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  return { db: chain as unknown, chain };
}

const now = new Date();

const profileRow = {
  id: "00000000-0000-0000-0000-000000000001",
  handle: "user",
  displayName: "User",
  bio: null,
  avatarUrl: null,
  defaultVisibility: "public" as const,
  version: 2,
  createdAt: now,
  updatedAt: now
};

const shelfRow = {
  id: "00000000-0000-0000-0000-000000000002",
  ownerId: "00000000-0000-0000-0000-000000000001",
  name: "Finished",
  slug: "finished",
  visibility: "public" as const,
  isSystem: false,
  kind: "custom" as const,
  authorType: "user" as const,
  curatorTier: null,
  description: null,
  publishedAt: null,
  version: 2,
  createdAt: now,
  updatedAt: now
};

const reviewRow = {
  id: "00000000-0000-0000-0000-000000000003",
  authorId: "00000000-0000-0000-0000-000000000001",
  bookId: "00000000-0000-0000-0000-000000000004",
  editionId: null,
  body: "Great book.",
  visibility: "public" as const,
  version: 2,
  createdAt: now,
  updatedAt: now
};

describe("version enforcement — DrizzleProfileRepository.update", () => {
  it("returns updated profile and increments version on match", async () => {
    const { db } = makeDb([profileRow]);
    const repo = new DrizzleProfileRepository(db as never);
    const result = await repo.update({
      id: profileRow.id,
      version: 1,
      displayName: "New Name"
    });
    expect(result.version).toBe(2);
    expect(result.handle).toBe("user");
  });

  it("throws VersionConflictError when no row returned (stale version)", async () => {
    const { db } = makeDb([]);
    const repo = new DrizzleProfileRepository(db as never);
    await expect(
      repo.update({ id: profileRow.id, version: 99, displayName: "X" })
    ).rejects.toBeInstanceOf(VersionConflictError);
  });

  it("VersionConflictError has correct code and message", async () => {
    const { db } = makeDb([]);
    const repo = new DrizzleProfileRepository(db as never);
    const err = await repo
      .update({ id: profileRow.id, version: 99 })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(VersionConflictError);
    expect((err as VersionConflictError).code).toBe("VERSION_CONFLICT");
    expect((err as VersionConflictError).message).toContain(profileRow.id);
  });
});

describe("version enforcement — DrizzleShelfRepository.update", () => {
  it("returns updated shelf and increments version on match", async () => {
    const { db } = makeDb([shelfRow]);
    const repo = new DrizzleShelfRepository(db as never);
    const result = await repo.update({
      id: shelfRow.id,
      ownerId: shelfRow.ownerId,
      version: 1,
      name: "Updated"
    });
    expect(result.version).toBe(2);
    expect(result.name).toBe("Finished");
  });

  it("throws VersionConflictError when no row returned (stale version)", async () => {
    const { db } = makeDb([]);
    const repo = new DrizzleShelfRepository(db as never);
    await expect(
      repo.update({ id: shelfRow.id, ownerId: shelfRow.ownerId, version: 99, name: "X" })
    ).rejects.toBeInstanceOf(VersionConflictError);
  });

  it("VersionConflictError contains the shelf id", async () => {
    const { db } = makeDb([]);
    const repo = new DrizzleShelfRepository(db as never);
    const err = await repo
      .update({ id: shelfRow.id, ownerId: shelfRow.ownerId, version: 99 })
      .catch((e: unknown) => e);
    expect((err as VersionConflictError).message).toContain(shelfRow.id);
  });
});

describe("version enforcement — DrizzleReviewRepository.update", () => {
  it("returns updated review and increments version on match", async () => {
    const { db } = makeDb([reviewRow]);
    const repo = new DrizzleReviewRepository(db as never);
    const result = await repo.update({
      id: reviewRow.id,
      authorId: reviewRow.authorId,
      version: 1,
      body: "Updated body"
    });
    expect(result.version).toBe(2);
    expect(result.body).toBe("Great book.");
  });

  it("throws VersionConflictError when no row returned (stale version)", async () => {
    const { db } = makeDb([]);
    const repo = new DrizzleReviewRepository(db as never);
    await expect(
      repo.update({ id: reviewRow.id, authorId: reviewRow.authorId, version: 99, body: "X" })
    ).rejects.toBeInstanceOf(VersionConflictError);
  });

  it("VersionConflictError contains the review id", async () => {
    const { db } = makeDb([]);
    const repo = new DrizzleReviewRepository(db as never);
    const err = await repo
      .update({ id: reviewRow.id, authorId: reviewRow.authorId, version: 99 })
      .catch((e: unknown) => e);
    expect((err as VersionConflictError).message).toContain(reviewRow.id);
  });
});

describe("VersionConflictError class", () => {
  it("has name VersionConflictError", () => {
    const err = new VersionConflictError("review", "abc-123");
    expect(err.name).toBe("VersionConflictError");
  });

  it("is an instance of Error", () => {
    const err = new VersionConflictError("shelf", "abc-123");
    expect(err).toBeInstanceOf(Error);
  });

  it("has code VERSION_CONFLICT", () => {
    const err = new VersionConflictError("profile", "abc-123");
    expect(err.code).toBe("VERSION_CONFLICT");
  });
});
