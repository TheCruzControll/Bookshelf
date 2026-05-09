import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { trpcServer } from "@hono/trpc-server";
import { createTrpcContext } from "./context";
import { router } from "./trpc";
import { profileRouter } from "./profile";
import type { AppRepositories, AuthIdentity } from "@hone/domain";

vi.mock("@hone/observability", () => ({
  captureException: vi.fn(),
  createLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn() })),
  initSentry: vi.fn(),
  setSentryUser: vi.fn(),
  clearSentryUser: vi.fn(),
}));

function makeRepositories(overrides?: Partial<AppRepositories>): AppRepositories {
  const now = new Date();
  const baseProfile = {
    id: "00000000-0000-0000-0000-000000000001",
    handle: "bookworm42",
    displayName: "Book Worm",
    defaultVisibility: "public" as const,
    createdAt: now,
    updatedAt: now,
  };
  return {
    profiles: {
      findById: vi.fn(),
      findByHandle: vi.fn(),
      create: vi.fn(),
      isHandleTaken: vi.fn().mockResolvedValue(false),
      setHandle: vi.fn().mockResolvedValue(baseProfile),
      ...overrides?.profiles,
    },
    books: { findBookById: vi.fn(), findEditionByIsbn: vi.fn(), search: vi.fn() },
    shelves: { listShelves: vi.fn(), addBook: vi.fn(), rankShelfItem: vi.fn() },
    reviews: { create: vi.fn() },
    activity: { append: vi.fn(), getFriendFeed: vi.fn() },
    recommendations: { getForUser: vi.fn() },
    follows: { follow: vi.fn(), unfollow: vi.fn(), findFollow: vi.fn(), listFollowers: vi.fn(), listFollowing: vi.fn(), isMutual: vi.fn() },
    blocks: { block: vi.fn(), unblock: vi.fn(), findBlock: vi.fn(), listBlockedByUser: vi.fn(), isBlocked: vi.fn() },
    rankings: { upsert: vi.fn(), findByOwnerAndBook: vi.fn(), listByOwner: vi.fn(), delete: vi.fn() },
    notifications: { registerToken: vi.fn(), removeToken: vi.fn(), listTokensForUser: vi.fn() },
    imports: { create: vi.fn(), findById: vi.fn(), listByOwner: vi.fn(), updateStatus: vi.fn() },
    contacts: { upsertHashes: vi.fn(), findMatches: vi.fn(), deleteForUser: vi.fn(), deleteExpired: vi.fn(), listByUser: vi.fn() },
    lists: { create: vi.fn(), findById: vi.fn(), listByOwner: vi.fn(), update: vi.fn(), delete: vi.fn(), addItem: vi.fn(), removeItem: vi.fn(), listItems: vi.fn(), reorderItems: vi.fn() },
    sessions: { create: vi.fn(), findById: vi.fn(), deleteById: vi.fn(), deleteAllForUser: vi.fn() },
    ...overrides,
  };
}

function makeIdentity(overrides?: Partial<AuthIdentity>): AuthIdentity {
  return {
    userId: "00000000-0000-0000-0000-000000000001",
    ...overrides,
  };
}

function buildApp(identity: AuthIdentity | null, repositories: AppRepositories) {
  const testRouter = router({ profile: profileRouter });
  const app = new Hono();
  const auth = { getCurrentIdentity: async () => identity };
  app.use(
    "/trpc/*",
    trpcServer({
      router: testRouter,
      createContext: createTrpcContext({ repositories, auth }),
    })
  );
  return app;
}

describe("profile.checkHandle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns available=true for a free handle", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request(
      "/trpc/profile.checkHandle?input=" + encodeURIComponent(JSON.stringify({ handle: "bookworm42" }))
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.available).toBe(true);
    expect(body.result.data.suggestions).toHaveLength(0);
  });

  it("returns available=false and suggestions for a taken handle", async () => {
    const repos = makeRepositories({
      profiles: {
        findById: vi.fn(),
        findByHandle: vi.fn(),
        create: vi.fn(),
        isHandleTaken: vi.fn().mockResolvedValue(true),
        setHandle: vi.fn(),
      },
    });
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request(
      "/trpc/profile.checkHandle?input=" + encodeURIComponent(JSON.stringify({ handle: "bookworm42" }))
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.available).toBe(false);
    expect(body.result.data.suggestions.length).toBeGreaterThan(0);
  });

  it("returns available=false for reserved handle 'admin'", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request(
      "/trpc/profile.checkHandle?input=" + encodeURIComponent(JSON.stringify({ handle: "admin" }))
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.available).toBe(false);
  });

  it("returns 401 when unauthenticated", async () => {
    const repos = makeRepositories();
    const app = buildApp(null, repos);
    const res = await app.request(
      "/trpc/profile.checkHandle?input=" + encodeURIComponent(JSON.stringify({ handle: "bookworm42" }))
    );
    expect(res.status).toBe(401);
  });

  it("validates handle format - rejects handle shorter than 3 chars", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request(
      "/trpc/profile.checkHandle?input=" + encodeURIComponent(JSON.stringify({ handle: "ab" }))
    );
    expect(res.status).toBe(400);
  });

  it("validates handle format - rejects handle with invalid chars", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request(
      "/trpc/profile.checkHandle?input=" + encodeURIComponent(JSON.stringify({ handle: "book-worm!" }))
    );
    expect(res.status).toBe(400);
  });
});

describe("profile.setHandle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets handle and returns profile on success", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request("/trpc/profile.setHandle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle: "bookworm42" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.profile).toBeDefined();
    expect(body.result.data.profile.handle).toBe("bookworm42");
  });

  it("returns 409 when handle is taken", async () => {
    const repos = makeRepositories({
      profiles: {
        findById: vi.fn(),
        findByHandle: vi.fn(),
        create: vi.fn(),
        isHandleTaken: vi.fn().mockResolvedValue(true),
        setHandle: vi.fn(),
      },
    });
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request("/trpc/profile.setHandle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle: "bookworm42" }),
    });
    expect(res.status).toBe(409);
  });

  it("returns 401 when unauthenticated", async () => {
    const repos = makeRepositories();
    const app = buildApp(null, repos);
    const res = await app.request("/trpc/profile.setHandle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle: "bookworm42" }),
    });
    expect(res.status).toBe(401);
  });

  it("normalizes handle to lowercase before setting", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);
    await app.request("/trpc/profile.setHandle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle: "BookWorm42" }),
    });
    expect(repos.profiles.setHandle).toHaveBeenCalledWith({
      userId: "00000000-0000-0000-0000-000000000001",
      handle: "bookworm42",
    });
  });

  it("rejects reserved handle 'root'", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);
    const res = await app.request("/trpc/profile.setHandle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle: "root" }),
    });
    expect(res.status).toBe(409);
  });
});
