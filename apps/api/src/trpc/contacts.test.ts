import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { trpcServer } from "@hono/trpc-server";
import { createTrpcContext } from "./context";
import { router } from "./trpc";
import { contactsRouter } from "./contacts";
import type { AppRepositories, AuthIdentity } from "@hone/domain";
import { CONTACTS_BATCH_MAX } from "@hone/domain";

vi.mock("@hone/observability", () => ({
  captureException: vi.fn(),
  createLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn() })),
  initSentry: vi.fn(),
  setSentryUser: vi.fn(),
  clearSentryUser: vi.fn(),
}));

const UUID1 = "00000000-0000-0000-0000-000000000001";
const EXPIRES_AT = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

function makeRepositories(overrides?: Partial<AppRepositories>): AppRepositories {
  return {
    accountDeletions: { create: vi.fn(), findByProfileId: vi.fn().mockResolvedValue(null), delete: vi.fn(), listExpired: vi.fn().mockResolvedValue([]), purgeProfile: vi.fn() },
    profiles: {
      findById: vi.fn(),
      findByHandle: vi.fn(),
      create: vi.fn(),
      isHandleTaken: vi.fn(),
      setHandle: vi.fn(),
    },
    books: { findBookById: vi.fn(), findEditionByIsbn: vi.fn(), search: vi.fn() },
    shelves: {
      listShelves: vi.fn().mockResolvedValue([]),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      addBook: vi.fn(),
      rankShelfItem: vi.fn(),
      createSystemShelves: vi.fn(),
      findShelfItem: vi.fn(),
      upsertShelfItem: vi.fn(),
      deleteShelfItem: vi.fn(),
      getMaxPosition: vi.fn().mockResolvedValue(0),
      moveShelfItem: vi.fn(),
    },
    reviews: { findById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    activity: { append: vi.fn(), getFriendFeed: vi.fn(), deleteByReviewId: vi.fn() },
    recommendations: { getForUser: vi.fn() },
    follows: { follow: vi.fn(), unfollow: vi.fn(), findFollow: vi.fn(), listFollowers: vi.fn(), listFollowing: vi.fn(), isMutual: vi.fn(), countMutuals: vi.fn() },
    blocks: { block: vi.fn(), unblock: vi.fn(), findBlock: vi.fn(), listBlockedByUser: vi.fn().mockResolvedValue([]), listBlockingUser: vi.fn().mockResolvedValue([]), isBlocked: vi.fn() },
    rankings: { upsert: vi.fn(), findById: vi.fn(), findByOwnerAndBook: vi.fn(), listByOwner: vi.fn(), delete: vi.fn(), startBucket: vi.fn() },
    notifications: { registerToken: vi.fn(), removeToken: vi.fn(), listTokensForProfile: vi.fn(), getSetting: vi.fn(), setSetting: vi.fn(), listSettings: vi.fn() },
    imports: { create: vi.fn(), findById: vi.fn(), findByOwnerAndHash: vi.fn(), listByOwner: vi.fn(), updateStatus: vi.fn() },
    contacts: { upsertHashes: vi.fn().mockResolvedValue(undefined), findMatches: vi.fn().mockResolvedValue([]), deleteForUser: vi.fn().mockResolvedValue(undefined), deleteExpired: vi.fn(), expireBySaltVersion: vi.fn(), listByUser: vi.fn() },
    emailIndex: { upsertHashes: vi.fn().mockResolvedValue(undefined), findMatches: vi.fn().mockResolvedValue([]), deleteForUser: vi.fn().mockResolvedValue(undefined), deleteExpired: vi.fn(), expireBySaltVersion: vi.fn(), listByUser: vi.fn() },
    lists: { create: vi.fn(), findById: vi.fn(), listByOwner: vi.fn(), update: vi.fn(), delete: vi.fn(), addItem: vi.fn(), removeItem: vi.fn(), listItems: vi.fn(), reorderItems: vi.fn() },
    authIdentities: { create: vi.fn(), findByProvider: vi.fn(), listByProfile: vi.fn() },
    sessions: { create: vi.fn(), findByTokenHash: vi.fn(), revokeByTokenHash: vi.fn(), revokeAllForProfile: vi.fn() },
    handleHistory: { record: vi.fn(), findCurrentByOldHandle: vi.fn() },
    magicLinks: { create: vi.fn(), findByTokenHash: vi.fn(), markConsumed: vi.fn(), deleteExpiredForEmail: vi.fn() },
    inAppNotifications: { list: vi.fn().mockResolvedValue([]), markRead: vi.fn().mockResolvedValue(undefined), findById: vi.fn(), countSince: vi.fn().mockResolvedValue(0), countSinceByActor: vi.fn().mockResolvedValue(0) },
    phoneVerifications: { upsert: vi.fn(), findByPhone: vi.fn(), incrementAttempts: vi.fn(), deleteByPhone: vi.fn(), deleteExpired: vi.fn() },
    phoneNumbers: { upsert: vi.fn(), findByProfileId: vi.fn(), findByHash: vi.fn() },
    salts: {
      create: vi.fn(),
      findActive: vi.fn().mockResolvedValue({
        id: "salt-1",
        version: 3,
        keyMaterial: "abc123",
        activeFrom: new Date("2026-05-01"),
        activeTo: undefined,
        createdAt: new Date("2026-05-01"),
      }),
      findByVersion: vi.fn(),
      retire: vi.fn(),
      getLatestVersion: vi.fn(),
      listAll: vi.fn(),
    },
    ...overrides,
  } as unknown as AppRepositories;
}

function makeIdentity(overrides?: Partial<AuthIdentity>): AuthIdentity {
  return {
    userId: UUID1,
    ...overrides,
  };
}

function buildApp(identity: AuthIdentity | null, repositories: AppRepositories) {
  const testRouter = router({ contacts: contactsRouter });
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

describe("contacts.upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uploads phone hashes with valid salt version", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);

    const res = await app.request("/trpc/contacts.upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        saltVersion: 3,
        phoneHashes: [
          { hash: "abc123def456", saltVersion: 3, expiresAt: EXPIRES_AT.toISOString() },
          { hash: "789ghi012jkl", saltVersion: 3, expiresAt: EXPIRES_AT.toISOString() },
        ],
        emailHashes: [],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.success).toBe(true);
    expect(body.result.data.phonesUploaded).toBe(2);
    expect(body.result.data.emailsUploaded).toBe(0);
    expect(repos.contacts.upsertHashes).toHaveBeenCalledWith({
      userId: UUID1,
      hashes: expect.arrayContaining([
        expect.objectContaining({ hash: "abc123def456", saltVersion: 3 }),
      ]),
    });
  });

  it("uploads email hashes with valid salt version", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);

    const res = await app.request("/trpc/contacts.upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        saltVersion: 3,
        phoneHashes: [],
        emailHashes: [
          { hash: "emailhash1", saltVersion: 3, expiresAt: EXPIRES_AT.toISOString() },
        ],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.success).toBe(true);
    expect(body.result.data.phonesUploaded).toBe(0);
    expect(body.result.data.emailsUploaded).toBe(1);
    expect(repos.emailIndex.upsertHashes).toHaveBeenCalled();
  });

  it("rejects upload with stale salt version", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);

    const res = await app.request("/trpc/contacts.upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        saltVersion: 2, // stale — active is 3
        phoneHashes: [
          { hash: "abc123", saltVersion: 2, expiresAt: EXPIRES_AT.toISOString() },
        ],
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toContain("Stale salt version");
    // Should not have inserted anything
    expect(repos.contacts.upsertHashes).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    const repos = makeRepositories();
    const app = buildApp(null, repos);

    const res = await app.request("/trpc/contacts.upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        saltVersion: 3,
        phoneHashes: [
          { hash: "abc123", saltVersion: 3, expiresAt: EXPIRES_AT.toISOString() },
        ],
      }),
    });

    expect(res.status).toBe(401);
  });

  it("rejects batch exceeding CONTACTS_BATCH_MAX", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);

    // Generate a batch that exceeds the max
    const oversizedBatch = Array.from({ length: CONTACTS_BATCH_MAX + 1 }, (_, i) => ({
      hash: `hash-${i}`,
      saltVersion: 3,
      expiresAt: EXPIRES_AT.toISOString(),
    }));

    const res = await app.request("/trpc/contacts.upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        saltVersion: 3,
        phoneHashes: oversizedBatch,
      }),
    });

    expect(res.status).toBe(400);
    expect(repos.contacts.upsertHashes).not.toHaveBeenCalled();
  });

  it("accepts a batch exactly at CONTACTS_BATCH_MAX", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);

    const maxBatch = Array.from({ length: CONTACTS_BATCH_MAX }, (_, i) => ({
      hash: `hash-${i}`,
      saltVersion: 3,
      expiresAt: EXPIRES_AT.toISOString(),
    }));

    const res = await app.request("/trpc/contacts.upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        saltVersion: 3,
        phoneHashes: maxBatch,
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.phonesUploaded).toBe(CONTACTS_BATCH_MAX);
  });

  it("inserts into contacts_index via repository", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);

    await app.request("/trpc/contacts.upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        saltVersion: 3,
        phoneHashes: [
          { hash: "phone-hash-1", saltVersion: 3, expiresAt: EXPIRES_AT.toISOString() },
        ],
        emailHashes: [
          { hash: "email-hash-1", saltVersion: 3, expiresAt: EXPIRES_AT.toISOString() },
        ],
      }),
    });

    expect(repos.contacts.upsertHashes).toHaveBeenCalledWith({
      userId: UUID1,
      hashes: [
        expect.objectContaining({ hash: "phone-hash-1", saltVersion: 3 }),
      ],
    });
    expect(repos.emailIndex.upsertHashes).toHaveBeenCalledWith({
      userId: UUID1,
      hashes: [
        expect.objectContaining({ hash: "email-hash-1", saltVersion: 3 }),
      ],
    });
  });

  it("rejects missing saltVersion field", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);

    const res = await app.request("/trpc/contacts.upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phoneHashes: [
          { hash: "abc123", saltVersion: 3, expiresAt: EXPIRES_AT.toISOString() },
        ],
      }),
    });

    expect(res.status).toBe(400);
  });
});

describe("contacts.match", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns matched user IDs", async () => {
    const UUID2 = "00000000-0000-0000-0000-000000000002";
    const UUID3 = "00000000-0000-0000-0000-000000000003";
    const repos = makeRepositories();
    (repos.contacts.findMatches as ReturnType<typeof vi.fn>).mockResolvedValue([UUID2, UUID3]);
    const app = buildApp(makeIdentity(), repos);

    const res = await app.request(
      `/trpc/contacts.match?input=${encodeURIComponent(JSON.stringify({ phoneHashes: ["hash1", "hash2"] }))}`
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.matches).toContain(UUID2);
    expect(body.result.data.matches).toContain(UUID3);
  });

  it("returns 401 when unauthenticated", async () => {
    const repos = makeRepositories();
    const app = buildApp(null, repos);

    const res = await app.request(
      `/trpc/contacts.match?input=${encodeURIComponent(JSON.stringify({ phoneHashes: ["hash1"] }))}`
    );

    expect(res.status).toBe(401);
  });
});

describe("contacts.delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes user contacts from both indexes", async () => {
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos);

    const res = await app.request("/trpc/contacts.delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.success).toBe(true);
    expect(repos.contacts.deleteForUser).toHaveBeenCalledWith(UUID1);
    expect(repos.emailIndex.deleteForUser).toHaveBeenCalledWith(UUID1);
  });

  it("returns 401 when unauthenticated", async () => {
    const repos = makeRepositories();
    const app = buildApp(null, repos);

    const res = await app.request("/trpc/contacts.delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(401);
  });
});
