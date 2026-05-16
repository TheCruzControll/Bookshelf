import { createHash } from "node:crypto";
import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import { createTrpcContext, type TrpcContext } from "./context";
import type { AppRepositories, Profile, Session } from "@hone/domain";
import { POSTURE_C_DEFAULTS } from "@hone/domain";

vi.mock("@hone/observability", () => ({
  captureException: vi.fn(),
  createLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn() })),
  initSentry: vi.fn(),
  setSentryUser: vi.fn(),
  clearSentryUser: vi.fn(),
}));

const PROFILE_ID = "00000000-0000-0000-0000-000000000001";

function makeProfile(overrides?: Partial<Profile>): Profile {
  const now = new Date();
  return {
    id: PROFILE_ID,
    handle: "testuser",
    displayName: "Test User",
    verified: false,
    defaultVisibility: POSTURE_C_DEFAULTS,
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeSession(overrides?: Partial<Session>): Session {
  return {
    tokenHash: "deadbeef",
    profileId: PROFILE_ID,
    expiresAt: new Date(Date.now() + 3600_000),
    ...overrides,
  };
}

function makeRepositories(opts?: {
  session?: Session | null;
  profile?: Profile | null;
}): AppRepositories {
  const session = opts?.session !== undefined ? opts.session : makeSession();
  const profile = opts?.profile !== undefined ? opts.profile : makeProfile();
  return {
    sessions: {
      create: vi.fn(),
      findByTokenHash: vi.fn().mockResolvedValue(session),
      revokeByTokenHash: vi.fn(),
      revokeAllForProfile: vi.fn(),
    },
    accountDeletions: { create: vi.fn(), findByProfileId: vi.fn().mockResolvedValue(null), delete: vi.fn(), listExpired: vi.fn().mockResolvedValue([]), purgeProfile: vi.fn() },
    profiles: {
      findById: vi.fn().mockResolvedValue(profile),
      findByHandle: vi.fn(),
      create: vi.fn(),
      isHandleTaken: vi.fn(),
      setHandle: vi.fn(),
    },
    books: { findBookById: vi.fn(), findEditionByIsbn: vi.fn(), findBookByIsbn13: vi.fn().mockResolvedValue(null), search: vi.fn(), upsertFromCatalogResult: vi.fn() },
    shelves: { listShelves: vi.fn(), findById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), addBook: vi.fn(), rankShelfItem: vi.fn(), createSystemShelves: vi.fn(), findShelfItem: vi.fn(), upsertShelfItem: vi.fn(), deleteShelfItem: vi.fn(), getMaxPosition: vi.fn().mockResolvedValue(0), moveShelfItem: vi.fn(), listOwnersWithBookOnSystemShelf: vi.fn().mockResolvedValue([]) },
    reviews: { findById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    activity: { append: vi.fn(), getFriendFeed: vi.fn(), getFriendFeedGrouped: vi.fn(), deleteByReviewId: vi.fn() },
    recommendations: { getForUser: vi.fn() },
    follows: { follow: vi.fn(), unfollow: vi.fn(), findFollow: vi.fn(), listFollowers: vi.fn(), listFollowing: vi.fn(), isMutual: vi.fn(), countMutuals: vi.fn(), listMutualIds: vi.fn().mockResolvedValue([]) },
    blocks: { block: vi.fn(), unblock: vi.fn(), findBlock: vi.fn(), listBlockedByUser: vi.fn(), isBlocked: vi.fn() },
    rankings: { upsert: vi.fn(), findById: vi.fn(), findByOwnerAndBook: vi.fn(), listByOwner: vi.fn(), delete: vi.fn(), startBucket: vi.fn() },
    notifications: { registerToken: vi.fn(), removeToken: vi.fn(), listTokensForProfile: vi.fn(), getSetting: vi.fn(), setSetting: vi.fn(), listSettings: vi.fn() },
    imports: { create: vi.fn(), findById: vi.fn(), findByOwnerAndHash: vi.fn(), listByOwner: vi.fn(), updateStatus: vi.fn() },
    contacts: { upsertHashes: vi.fn(), findMatches: vi.fn(), findMatchingProfilesByPhone: vi.fn(), deleteForUser: vi.fn(), deleteExpired: vi.fn(), expireBySaltVersion: vi.fn(), deleteByTargetHash: vi.fn(), listByUser: vi.fn(), softDisable: vi.fn(), purgeOlderThan: vi.fn().mockResolvedValue(0) },
    emailIndex: { upsertHashes: vi.fn(), findMatches: vi.fn(), deleteForUser: vi.fn(), deleteExpired: vi.fn(), expireBySaltVersion: vi.fn(), deleteByTargetHash: vi.fn(), listByUser: vi.fn() },
    lists: { create: vi.fn(), findById: vi.fn(), listByOwner: vi.fn(), update: vi.fn(), delete: vi.fn(), addItem: vi.fn(), removeItem: vi.fn(), listItems: vi.fn(), reorderItems: vi.fn() },
    authIdentities: { create: vi.fn(), findByProvider: vi.fn(), listByProfile: vi.fn() },
    inAppNotifications: { list: vi.fn().mockResolvedValue([]), markRead: vi.fn().mockResolvedValue(undefined), findById: vi.fn(), countSince: vi.fn().mockResolvedValue(0), countSinceByActor: vi.fn().mockResolvedValue(0), create: vi.fn() },
  } as unknown as AppRepositories;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

async function resolveContext(
  repos: AppRepositories | undefined,
  headers?: Record<string, string>
): Promise<TrpcContext> {
  const app = new Hono();
  let capturedCtx: TrpcContext | undefined;

  const deps: { repositories?: AppRepositories } = {};
  if (repos !== undefined) deps.repositories = repos;
  const contextFn = createTrpcContext(deps);

  app.get("/test", async (c) => {
    capturedCtx = await contextFn({} as Parameters<typeof contextFn>[0], c);
    return c.json({ ok: true });
  });

  const reqHeaders: Record<string, string> = headers ?? {};
  await app.request("/test", { headers: reqHeaders });
  return capturedCtx!;
}

describe("createTrpcContext – Bearer token", () => {
  it("sets viewer to null when no authorization header and no cookie", async () => {
    const repos = makeRepositories();
    const ctx = await resolveContext(repos);
    expect(ctx.viewer).toBeNull();
  });

  it("resolves viewer from Authorization: Bearer token", async () => {
    const rawToken = "my-secret-session-token";
    const profile = makeProfile();
    const repos = makeRepositories({ session: makeSession({ tokenHash: hashToken(rawToken) }), profile });

    const ctx = await resolveContext(repos, { authorization: `Bearer ${rawToken}` });
    expect(ctx.viewer).toEqual(profile);
  });

  it("looks up session using SHA-256 hash of the raw token", async () => {
    const rawToken = "token-abc-123";
    const repos = makeRepositories();
    await resolveContext(repos, { authorization: `Bearer ${rawToken}` });
    const expectedHash = hashToken(rawToken);
    expect(repos.sessions.findByTokenHash).toHaveBeenCalledWith(expectedHash);
  });

  it("sets viewer to null when session not found", async () => {
    const repos = makeRepositories({ session: null });
    const ctx = await resolveContext(repos, { authorization: "Bearer missing-token" });
    expect(ctx.viewer).toBeNull();
  });

  it("sets viewer to null when session is revoked", async () => {
    const revokedSession = makeSession({ revokedAt: new Date(Date.now() - 1000) });
    const repos = makeRepositories({ session: revokedSession });
    const ctx = await resolveContext(repos, { authorization: "Bearer some-token" });
    expect(ctx.viewer).toBeNull();
  });

  it("sets viewer to null when session is expired", async () => {
    const expiredSession = makeSession({ expiresAt: new Date(Date.now() - 1000) });
    const repos = makeRepositories({ session: expiredSession });
    const ctx = await resolveContext(repos, { authorization: "Bearer some-token" });
    expect(ctx.viewer).toBeNull();
  });

  it("does not look up session when no repositories are configured", async () => {
    const ctx = await resolveContext(undefined, { authorization: "Bearer some-token" });
    expect(ctx.viewer).toBeNull();
  });
});

describe("createTrpcContext – cookie token", () => {
  it("resolves viewer from session cookie", async () => {
    const rawToken = "cookie-session-token";
    const profile = makeProfile();
    const repos = makeRepositories({ session: makeSession({ tokenHash: hashToken(rawToken) }), profile });

    const ctx = await resolveContext(repos, { cookie: `session=${rawToken}` });
    expect(ctx.viewer).toEqual(profile);
  });

  it("prefers Authorization: Bearer over cookie when both are present", async () => {
    const bearerToken = "bearer-token";
    const cookieToken = "cookie-token";
    const profile = makeProfile();
    const repos = makeRepositories({ session: makeSession({ tokenHash: hashToken(bearerToken) }), profile });

    const ctx = await resolveContext(repos, {
      authorization: `Bearer ${bearerToken}`,
      cookie: `session=${cookieToken}`,
    });

    expect(repos.sessions.findByTokenHash).toHaveBeenCalledWith(hashToken(bearerToken));
    expect(ctx.viewer).toEqual(profile);
  });
});

describe("createTrpcContext – profile loading", () => {
  it("loads profile by session.profileId", async () => {
    const rawToken = "token-xyz";
    const session = makeSession({ profileId: PROFILE_ID, tokenHash: hashToken(rawToken) });
    const profile = makeProfile({ id: PROFILE_ID });
    const repos = makeRepositories({ session, profile });

    await resolveContext(repos, { authorization: `Bearer ${rawToken}` });
    expect(repos.profiles.findById).toHaveBeenCalledWith(PROFILE_ID);
  });

  it("sets viewer to null when profile is not found", async () => {
    const rawToken = "token-no-profile";
    const session = makeSession({ tokenHash: hashToken(rawToken) });
    const repos = makeRepositories({ session, profile: null });

    const ctx = await resolveContext(repos, { authorization: `Bearer ${rawToken}` });
    expect(ctx.viewer).toBeNull();
  });
});
