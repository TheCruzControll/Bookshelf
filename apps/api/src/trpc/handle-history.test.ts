import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import { trpcServer } from "@hono/trpc-server";
import { createTrpcContext } from "./context";
import { router } from "./trpc";
import { handleHistoryRouter } from "./handle-history";
import type { AppRepositories, AuthIdentity } from "@hone/domain";

vi.mock("@hone/observability", () => ({
  captureException: vi.fn(),
  createLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn() })),
  initSentry: vi.fn(),
  setSentryUser: vi.fn(),
  clearSentryUser: vi.fn(),
}));

const NOW = new Date();

function makeProfile() {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    handle: "currenthandle",
    displayName: "Test User",
    defaultVisibility: "public" as const,
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function makeHandleHistoryEntry(oldHandle: string, profileId: string) {
  const expiresAt = new Date(NOW);
  expiresAt.setFullYear(expiresAt.getFullYear() + 3);
  return {
    id: "00000000-0000-0000-0000-000000000099",
    profileId,
    oldHandle,
    retiredAt: NOW,
    expiresAt,
  };
}

function makeRepositories(overrides?: Partial<AppRepositories>): AppRepositories {
  return {
    profiles: {
      findById: vi.fn().mockResolvedValue(makeProfile()),
      findByHandle: vi.fn(),
      create: vi.fn(),
      isHandleTaken: vi.fn(),
      setHandle: vi.fn(),
    },
    books: { findBookById: vi.fn(), findEditionByIsbn: vi.fn(), search: vi.fn() },
    shelves: { listShelves: vi.fn(), findById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), addBook: vi.fn(), rankShelfItem: vi.fn(), createSystemShelves: vi.fn() },
    reviews: { create: vi.fn(), update: vi.fn() },
    activity: { append: vi.fn(), getFriendFeed: vi.fn() },
    recommendations: { getForUser: vi.fn() },
    follows: { follow: vi.fn(), unfollow: vi.fn(), findFollow: vi.fn(), listFollowers: vi.fn(), listFollowing: vi.fn(), isMutual: vi.fn() },
    blocks: { block: vi.fn(), unblock: vi.fn(), findBlock: vi.fn(), listBlockedByUser: vi.fn(), isBlocked: vi.fn() },
    rankings: { upsert: vi.fn(), findById: vi.fn(), findByOwnerAndBook: vi.fn(), listByOwner: vi.fn(), delete: vi.fn(), startBucket: vi.fn() },
    notifications: { registerToken: vi.fn(), removeToken: vi.fn(), listTokensForUser: vi.fn() },
    imports: { create: vi.fn(), findById: vi.fn(), listByOwner: vi.fn(), updateStatus: vi.fn() },
    contacts: { upsertHashes: vi.fn(), findMatches: vi.fn(), deleteForUser: vi.fn(), deleteExpired: vi.fn(), listByUser: vi.fn() },
    lists: { create: vi.fn(), findById: vi.fn(), listByOwner: vi.fn(), update: vi.fn(), delete: vi.fn(), addItem: vi.fn(), removeItem: vi.fn(), listItems: vi.fn(), reorderItems: vi.fn() },
    sessions: { create: vi.fn(), findById: vi.fn(), deleteById: vi.fn(), deleteAllForUser: vi.fn() },
    handleHistory: {
      record: vi.fn(),
      findByOldHandle: vi.fn().mockResolvedValue(null),
      deleteExpired: vi.fn(),
    },
    ...overrides,
  };
}

function buildApp(repositories: AppRepositories) {
  const testRouter = router({ handleHistory: handleHistoryRouter });
  const app = new Hono();
  app.use(
    "/trpc/*",
    trpcServer({
      router: testRouter,
      createContext: createTrpcContext({ repositories }),
    })
  );
  return app;
}

describe("handleHistoryRouter.resolve", () => {
  it("returns currentHandle=null when old handle is not found", async () => {
    const repos = makeRepositories({
      handleHistory: {
        record: vi.fn(),
        findByOldHandle: vi.fn().mockResolvedValue(null),
        deleteExpired: vi.fn(),
      },
    });
    const app = buildApp(repos);
    const res = await app.request(
      `/trpc/handleHistory.resolve?input=${encodeURIComponent(JSON.stringify({ handle: "oldhandle" }))}`
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { result: { data: { currentHandle: string | null } } };
    expect(body.result.data.currentHandle).toBeNull();
  });

  it("returns currentHandle when old handle is found in history", async () => {
    const profile = makeProfile();
    const entry = makeHandleHistoryEntry("oldhandle", profile.id);
    const repos = makeRepositories({
      profiles: {
        findById: vi.fn().mockResolvedValue(profile),
        findByHandle: vi.fn(),
        create: vi.fn(),
        isHandleTaken: vi.fn(),
        setHandle: vi.fn(),
      },
      handleHistory: {
        record: vi.fn(),
        findByOldHandle: vi.fn().mockResolvedValue(entry),
        deleteExpired: vi.fn(),
      },
    });
    const app = buildApp(repos);
    const res = await app.request(
      `/trpc/handleHistory.resolve?input=${encodeURIComponent(JSON.stringify({ handle: "oldhandle" }))}`
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { result: { data: { currentHandle: string | null } } };
    expect(body.result.data.currentHandle).toBe("currenthandle");
  });

  it("returns currentHandle=null when profile is not found for history entry", async () => {
    const entry = makeHandleHistoryEntry("oldhandle", "00000000-0000-0000-0000-000000000001");
    const repos = makeRepositories({
      profiles: {
        findById: vi.fn().mockResolvedValue(null),
        findByHandle: vi.fn(),
        create: vi.fn(),
        isHandleTaken: vi.fn(),
        setHandle: vi.fn(),
      },
      handleHistory: {
        record: vi.fn(),
        findByOldHandle: vi.fn().mockResolvedValue(entry),
        deleteExpired: vi.fn(),
      },
    });
    const app = buildApp(repos);
    const res = await app.request(
      `/trpc/handleHistory.resolve?input=${encodeURIComponent(JSON.stringify({ handle: "oldhandle" }))}`
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { result: { data: { currentHandle: string | null } } };
    expect(body.result.data.currentHandle).toBeNull();
  });

  it("returns 500 when repositories are not configured", async () => {
    const testRouter = router({ handleHistory: handleHistoryRouter });
    const app = new Hono();
    app.use(
      "/trpc/*",
      trpcServer({
        router: testRouter,
        createContext: createTrpcContext({}),
      })
    );
    const res = await app.request(
      `/trpc/handleHistory.resolve?input=${encodeURIComponent(JSON.stringify({ handle: "test" }))}`
    );
    const body = await res.json() as { error: { data: { code: string } } };
    expect(body.error.data.code).toBe("INTERNAL_SERVER_ERROR");
  });
});
