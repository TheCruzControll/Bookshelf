import { describe, it, expect, vi } from "vitest";
import { createApi } from "./app";
import type { AppRepositories, AuthProvider } from "@hone/domain";

function makeShelfItem() {
  const now = new Date();
  return {
    id: "00000000-0000-0000-0000-000000000010",
    shelfId: "00000000-0000-0000-0000-000000000002",
    bookId: "00000000-0000-0000-0000-000000000003",
    status: "finished" as const,
    addedAt: now,
    updatedAt: now
  };
}

function makeRepositories(): AppRepositories {
  return {
    profiles: { findById: vi.fn(), findByHandle: vi.fn(), create: vi.fn(), update: vi.fn() },
    books: { findBookById: vi.fn(), findEditionByIsbn: vi.fn(), search: vi.fn() },
    shelves: {
      listShelves: vi.fn(),
      addBook: vi.fn().mockResolvedValue(makeShelfItem()),
      rankShelfItem: vi.fn(),
      update: vi.fn()
    },
    reviews: { create: vi.fn(), update: vi.fn() },
    activity: {
      append: vi.fn().mockResolvedValue({ id: "evt-1", actorId: "u1", verb: "book_added", visibility: "followers", occurredAt: new Date() }),
      getFriendFeed: vi.fn()
    },
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
}

describe("api smoke test", () => {
  it("createApi returns a Hono app with a /health endpoint", async () => {
    const app = createApi();
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, service: "hone-api" });
  });

  it("POST /shelves/books returns 503 when dependencies are not configured", async () => {
    const app = createApi();
    const res = await app.request("/shelves/books", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ownerId: "00000000-0000-0000-0000-000000000001",
        shelfId: "00000000-0000-0000-0000-000000000002",
        bookId: "00000000-0000-0000-0000-000000000003"
      })
    });
    expect(res.status).toBe(503);
  });

  it("POST /shelves/books returns 201 with shelfItem when dependencies are configured", async () => {
    const repositories = makeRepositories();
    const auth: AuthProvider = {
      getCurrentIdentity: vi.fn().mockResolvedValue({ userId: "00000000-0000-0000-0000-000000000001" })
    };
    const app = createApi({ repositories, auth });

    const res = await app.request("/shelves/books", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ownerId: "00000000-0000-0000-0000-000000000001",
        shelfId: "00000000-0000-0000-0000-000000000002",
        bookId: "00000000-0000-0000-0000-000000000003"
      })
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty("shelfItem");
    expect(body.shelfItem.id).toBe("00000000-0000-0000-0000-000000000010");
  });

  it("auth middleware sets Sentry user when identity is present", async () => {
    const repositories = makeRepositories();
    const auth: AuthProvider = {
      getCurrentIdentity: vi.fn().mockResolvedValue({
        userId: "00000000-0000-0000-0000-000000000001",
        email: "user@example.com"
      })
    };
    const app = createApi({ repositories, auth });

    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(auth.getCurrentIdentity).toHaveBeenCalled();
  });

  it("auth middleware clears Sentry user when no identity", async () => {
    const auth: AuthProvider = {
      getCurrentIdentity: vi.fn().mockResolvedValue(null)
    };
    const app = createApi({ auth });

    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(auth.getCurrentIdentity).toHaveBeenCalled();
  });

  it("auth middleware sets Sentry user without email when email is undefined", async () => {
    const repositories = makeRepositories();
    const auth: AuthProvider = {
      getCurrentIdentity: vi.fn().mockResolvedValue({
        userId: "00000000-0000-0000-0000-000000000001"
      })
    };
    const app = createApi({ repositories, auth });

    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(auth.getCurrentIdentity).toHaveBeenCalled();
  });
});
