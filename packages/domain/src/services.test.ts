import { describe, it, expect, vi } from "vitest";
import { ShelfService, AppServices } from "./services";
import type { ShelfRepository, ActivityRepository, AppRepositories, AuthProvider } from "./ports";
import type { ShelfItem } from "./types";

function makeShelfItem(overrides?: Partial<ShelfItem>): ShelfItem {
  const now = new Date();
  return {
    id: "00000000-0000-0000-0000-000000000010",
    shelfId: "00000000-0000-0000-0000-000000000011",
    bookId: "00000000-0000-0000-0000-000000000012",
    status: "finished",
    addedAt: now,
    updatedAt: now,
    ...overrides
  };
}

describe("ShelfService", () => {
  it("addBookToShelf delegates to shelves.addBook and appends an activity event", async () => {
    const shelfItem = makeShelfItem();
    const shelves: ShelfRepository = {
      listShelves: vi.fn(),
      addBook: vi.fn().mockResolvedValue(shelfItem),
      rankShelfItem: vi.fn(),
      update: vi.fn()
    };
    const activity: ActivityRepository = {
      append: vi.fn().mockResolvedValue({ id: "evt-1", actorId: "u1", verb: "book_added", visibility: "followers", occurredAt: new Date() }),
      getFriendFeed: vi.fn()
    };

    const service = new ShelfService(shelves, activity);
    const input = {
      ownerId: "00000000-0000-0000-0000-000000000001",
      shelfId: "00000000-0000-0000-0000-000000000011",
      bookId: "00000000-0000-0000-0000-000000000012"
    };

    const result = await service.addBookToShelf(input);

    expect(shelves.addBook).toHaveBeenCalledWith(input);
    expect(activity.append).toHaveBeenCalledWith({
      actorId: input.ownerId,
      verb: "book_added",
      bookId: input.bookId,
      shelfId: input.shelfId,
      visibility: "followers"
    });
    expect(result).toEqual(shelfItem);
  });

  it("addBookToShelf passes editionId when provided", async () => {
    const shelfItem = makeShelfItem({ editionId: "00000000-0000-0000-0000-000000000020" });
    const shelves: ShelfRepository = {
      listShelves: vi.fn(),
      addBook: vi.fn().mockResolvedValue(shelfItem),
      rankShelfItem: vi.fn(),
      update: vi.fn()
    };
    const activity: ActivityRepository = {
      append: vi.fn().mockResolvedValue({ id: "evt-2", actorId: "u1", verb: "book_added", visibility: "followers", occurredAt: new Date() }),
      getFriendFeed: vi.fn()
    };

    const service = new ShelfService(shelves, activity);
    const input = {
      ownerId: "00000000-0000-0000-0000-000000000001",
      shelfId: "00000000-0000-0000-0000-000000000011",
      bookId: "00000000-0000-0000-0000-000000000012",
      editionId: "00000000-0000-0000-0000-000000000020"
    };

    const result = await service.addBookToShelf(input);

    expect(shelves.addBook).toHaveBeenCalledWith(input);
    expect(result.editionId).toBe(input.editionId);
  });
});

describe("AppServices", () => {
  it("exposes a shelves service", () => {
    const repositories: AppRepositories = {
      profiles: { findById: vi.fn(), findByHandle: vi.fn(), create: vi.fn(), update: vi.fn() },
      books: { findBookById: vi.fn(), findEditionByIsbn: vi.fn(), search: vi.fn() },
      shelves: { listShelves: vi.fn(), addBook: vi.fn(), rankShelfItem: vi.fn(), update: vi.fn() },
      reviews: { create: vi.fn(), update: vi.fn() },
      activity: { append: vi.fn(), getFriendFeed: vi.fn() },
      recommendations: { getForUser: vi.fn() },
      follows: { follow: vi.fn(), unfollow: vi.fn(), findFollow: vi.fn(), listFollowers: vi.fn(), listFollowing: vi.fn(), isMutual: vi.fn() },
      blocks: { block: vi.fn(), unblock: vi.fn(), findBlock: vi.fn(), listBlockedByUser: vi.fn(), isBlocked: vi.fn() },
      rankings: { upsert: vi.fn(), findByOwnerAndBook: vi.fn(), listByOwner: vi.fn(), delete: vi.fn() },
      notifications: { registerToken: vi.fn(), removeToken: vi.fn(), listTokensForUser: vi.fn() },
      imports: { create: vi.fn(), findById: vi.fn(), listByOwner: vi.fn(), updateStatus: vi.fn() },
      contacts: { upsertHashes: vi.fn(), findMatches: vi.fn(), deleteForUser: vi.fn(), deleteExpired: vi.fn(), listByUser: vi.fn() },
      lists: { create: vi.fn(), findById: vi.fn(), listByOwner: vi.fn(), update: vi.fn(), delete: vi.fn(), addItem: vi.fn(), removeItem: vi.fn(), listItems: vi.fn(), reorderItems: vi.fn() },
      sessions: { create: vi.fn(), findById: vi.fn(), deleteById: vi.fn(), deleteAllForUser: vi.fn() }
    };
    const auth: AuthProvider = {
      getCurrentIdentity: vi.fn().mockResolvedValue(null)
    };

    const services = new AppServices(repositories, auth);

    expect(services.shelves).toBeInstanceOf(ShelfService);
    expect(services.repositories).toBe(repositories);
    expect(services.auth).toBe(auth);
  });
});
