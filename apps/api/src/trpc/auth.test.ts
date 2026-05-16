import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { trpcServer } from "@hono/trpc-server";
import { createTrpcContext } from "./context";
import { router } from "./trpc";
import { authRouter } from "./auth";
import type { AppRepositories, AppleJwksProvider, GoogleJwksProvider, AuthIdentity, OAuthIdentity, Session } from "@hone/domain";

vi.mock("@hone/observability", () => ({
  captureException: vi.fn(),
  createLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn() })),
  initSentry: vi.fn(),
  setSentryUser: vi.fn(),
  clearSentryUser: vi.fn(),
}));

const UUID1 = "00000000-0000-0000-0000-000000000001";

function makeRepositories(overrides?: Partial<AppRepositories>): AppRepositories {
  return {
    accountDeletions: { create: vi.fn(), findByProfileId: vi.fn().mockResolvedValue(null), delete: vi.fn() },
    profiles: {
      findById: vi.fn(),
      findByHandle: vi.fn(),
      create: vi.fn(),
      isHandleTaken: vi.fn().mockResolvedValue(false),
      setHandle: vi.fn(),
    },
    books: { findBookById: vi.fn(), findEditionByIsbn: vi.fn(), search: vi.fn() },
    shelves: {
      listShelves: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      addBook: vi.fn(),
      rankShelfItem: vi.fn(),
      createSystemShelves: vi.fn().mockResolvedValue([]),
      findShelfItem: vi.fn(),
      upsertShelfItem: vi.fn(),
      deleteShelfItem: vi.fn(),
      getMaxPosition: vi.fn().mockResolvedValue(0),
      moveShelfItem: vi.fn()
    },
    reviews: { findById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    activity: { append: vi.fn(), getFriendFeed: vi.fn(), getFriendFeedGrouped: vi.fn(), deleteByReviewId: vi.fn() },
    recommendations: { getForUser: vi.fn() },
    follows: { follow: vi.fn(), unfollow: vi.fn(), findFollow: vi.fn(), listFollowers: vi.fn(), listFollowing: vi.fn(), isMutual: vi.fn(), countMutuals: vi.fn() },
    blocks: { block: vi.fn(), unblock: vi.fn(), findBlock: vi.fn(), listBlockedByUser: vi.fn(), listBlockingUser: vi.fn(), isBlocked: vi.fn() },
    rankings: { upsert: vi.fn(), findById: vi.fn(), findByOwnerAndBook: vi.fn(), listByOwner: vi.fn(), delete: vi.fn(), startBucket: vi.fn() },
    notifications: { registerToken: vi.fn(), removeToken: vi.fn(), listTokensForProfile: vi.fn(), getSetting: vi.fn(), setSetting: vi.fn(), listSettings: vi.fn() },
    imports: { create: vi.fn(), findById: vi.fn(), findByOwnerAndHash: vi.fn(), listByOwner: vi.fn(), updateStatus: vi.fn() },
    contacts: { upsertHashes: vi.fn(), findMatches: vi.fn(), findMatchingProfilesByPhone: vi.fn(), deleteForUser: vi.fn(), deleteExpired: vi.fn(), expireBySaltVersion: vi.fn(), deleteByTargetHash: vi.fn(), listByUser: vi.fn() },
    emailIndex: { upsertHashes: vi.fn(), findMatches: vi.fn(), deleteForUser: vi.fn(), deleteExpired: vi.fn(), expireBySaltVersion: vi.fn(), deleteByTargetHash: vi.fn(), listByUser: vi.fn() },
    lists: { create: vi.fn(), findById: vi.fn(), listByOwner: vi.fn(), update: vi.fn(), delete: vi.fn(), addItem: vi.fn(), removeItem: vi.fn(), listItems: vi.fn(), reorderItems: vi.fn() },
    authIdentities: { create: vi.fn(), findByProvider: vi.fn(), listByProfile: vi.fn() },
    sessions: { create: vi.fn(), findByTokenHash: vi.fn(), revokeByTokenHash: vi.fn(), revokeAllForProfile: vi.fn() },
    handleHistory: { record: vi.fn(), findCurrentByOldHandle: vi.fn() },
    magicLinks: { create: vi.fn(), findByTokenHash: vi.fn(), markConsumed: vi.fn(), deleteExpiredForEmail: vi.fn() },
    inAppNotifications: { list: vi.fn().mockResolvedValue([]), markRead: vi.fn().mockResolvedValue(undefined), findById: vi.fn(), countSince: vi.fn().mockResolvedValue(0), countSinceByActor: vi.fn().mockResolvedValue(0) },
    phoneVerifications: { upsert: vi.fn(), findByPhone: vi.fn(), incrementAttempts: vi.fn(), deleteByPhone: vi.fn(), deleteExpired: vi.fn() },
    phoneNumbers: { upsert: vi.fn(), findByProfileId: vi.fn(), findByHash: vi.fn() },
    salts: { create: vi.fn(), findActive: vi.fn(), findByVersion: vi.fn(), retire: vi.fn(), getLatestVersion: vi.fn(), listAll: vi.fn() },
    ...overrides,
  };
}

function buildApp(identity: AuthIdentity | null, repositories: AppRepositories, jwksProvider?: AppleJwksProvider, googleJwksProvider?: GoogleJwksProvider) {
  const testRouter = router({ auth: authRouter });
  const app = new Hono();
  const auth = { getCurrentIdentity: async () => identity };
  const mockJwksProvider: AppleJwksProvider = jwksProvider ?? { fetchKeys: vi.fn().mockResolvedValue([]) };
  const mockGoogleJwksProvider: GoogleJwksProvider = googleJwksProvider ?? { fetchKeys: vi.fn().mockResolvedValue([]) };
  app.use(
    "/trpc/*",
    trpcServer({
      router: testRouter,
      createContext: createTrpcContext({ repositories, auth, jwksProvider: mockJwksProvider, appleAudience: "com.hone.app", googleJwksProvider: mockGoogleJwksProvider, googleAudience: "test-google-client-id.apps.googleusercontent.com" }),
    })
  );
  return app;
}

function buildAppWithEmail(identity: AuthIdentity | null, repositories: AppRepositories, emailProvider: { sendMagicLink: ReturnType<typeof vi.fn> }) {
  const testRouter = router({ auth: authRouter });
  const app = new Hono();
  const auth = { getCurrentIdentity: async () => identity };
  const mockJwksProvider: AppleJwksProvider = { fetchKeys: vi.fn().mockResolvedValue([]) };
  const mockGoogleJwksProvider: GoogleJwksProvider = { fetchKeys: vi.fn().mockResolvedValue([]) };
  app.use(
    "/trpc/*",
    trpcServer({
      router: testRouter,
      createContext: createTrpcContext({ repositories, auth, jwksProvider: mockJwksProvider, appleAudience: "com.hone.app", googleJwksProvider: mockGoogleJwksProvider, googleAudience: "test-google-client-id.apps.googleusercontent.com", emailProvider }),
    })
  );
  return app;
}

function buildFakeJwt(payload: Record<string, unknown>, kid = "test-key-id"): string {
  const header = { alg: "RS256", kid };
  const encode = (obj: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(obj)).toString("base64url");
  return `${encode(header)}.${encode(payload)}.fakesignature`;
}

const FUTURE_EXP = Math.floor(Date.now() / 1000) + 3600;
const VALID_APPLE_PAYLOAD = {
  iss: "https://appleid.apple.com",
  aud: "com.hone.app",
  exp: FUTURE_EXP,
  sub: "apple-user-001",
  email: "user@privaterelay.appleid.com",
  email_verified: true,
  is_private_email: true,
};

describe("auth.appleSignIn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 500 when repositories not configured", async () => {
    const testRouter = router({ auth: authRouter });
    const app = new Hono();
    app.use(
      "/trpc/*",
      trpcServer({
        router: testRouter,
        createContext: createTrpcContext({}),
      })
    );

    const token = buildFakeJwt(VALID_APPLE_PAYLOAD);
    const res = await app.request("/trpc/auth.appleSignIn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identityToken: token }),
    });
    expect(res.status).toBe(500);
  });

  it("returns 401 when token has wrong issuer", async () => {
    const repos = makeRepositories();
    const app = buildApp(null, repos);

    const payload = { ...VALID_APPLE_PAYLOAD, iss: "https://evil.example.com" };
    const token = buildFakeJwt(payload);

    const res = await app.request("/trpc/auth.appleSignIn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identityToken: token }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 when token is expired", async () => {
    const repos = makeRepositories();
    const app = buildApp(null, repos);

    const expiredPayload = { ...VALID_APPLE_PAYLOAD, exp: Math.floor(Date.now() / 1000) - 10 };
    const token = buildFakeJwt(expiredPayload);

    const res = await app.request("/trpc/auth.appleSignIn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identityToken: token }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 when token has wrong audience", async () => {
    const repos = makeRepositories();
    const app = buildApp(null, repos);

    const payload = { ...VALID_APPLE_PAYLOAD, aud: "com.wrong.app" };
    const token = buildFakeJwt(payload);

    const res = await app.request("/trpc/auth.appleSignIn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identityToken: token }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 when token does not have three parts", async () => {
    const repos = makeRepositories();
    const app = buildApp(null, repos);

    const res = await app.request("/trpc/auth.appleSignIn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identityToken: "notavalidjwt" }),
    });
    expect(res.status).toBe(401);
  });

  it("creates a new identity and session for a new Apple user (mocked service)", async () => {
    const mockSession: Session = {
      tokenHash: "abc123hash",
      profileId: UUID1,
      expiresAt: new Date(Date.now() + 86400000),
    };
    const mockIdentity: OAuthIdentity = {
      provider: "apple",
      providerUserId: VALID_APPLE_PAYLOAD.sub,
      profileId: UUID1,
    };

    const repos = makeRepositories({
      authIdentities: {
        create: vi.fn().mockResolvedValue(mockIdentity),
        findByProvider: vi.fn().mockResolvedValue(null),
        listByProfile: vi.fn(),
      },
      sessions: {
        create: vi.fn().mockResolvedValue(mockSession),
        findByTokenHash: vi.fn(),
        revokeByTokenHash: vi.fn(),
        revokeAllForProfile: vi.fn(),
      },
    });

    const { AuthService } = await import("@hone/domain");
    const appleSignInSpy = vi.spyOn(AuthService.prototype, "appleSignIn").mockResolvedValue({
      sessionToken: "raw-token-abc",
      expiresAt: mockSession.expiresAt,
      isNewUser: true,
    });

    const app = buildApp(null, repos);
    const token = buildFakeJwt(VALID_APPLE_PAYLOAD);

    const res = await app.request("/trpc/auth.appleSignIn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identityToken: token }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { result?: { data?: { sessionToken: string; isNewUser: boolean } } };
    expect(body.result?.data?.sessionToken).toBe("raw-token-abc");
    expect(body.result?.data?.isNewUser).toBe(true);

    appleSignInSpy.mockRestore();
  });

  it("links existing identity and returns isNewUser=false (mocked service)", async () => {
    const existingSession: Session = {
      tokenHash: "existing-hash",
      profileId: UUID1,
      expiresAt: new Date(Date.now() + 86400000),
    };

    const repos = makeRepositories({
      authIdentities: {
        create: vi.fn(),
        findByProvider: vi.fn(),
        listByProfile: vi.fn(),
      },
      sessions: {
        create: vi.fn(),
        findByTokenHash: vi.fn(),
        revokeByTokenHash: vi.fn(),
        revokeAllForProfile: vi.fn(),
      },
    });

    const { AuthService } = await import("@hone/domain");
    const appleSignInSpy = vi.spyOn(AuthService.prototype, "appleSignIn").mockResolvedValue({
      sessionToken: "raw-token-xyz",
      expiresAt: existingSession.expiresAt,
      isNewUser: false,
    });

    const app = buildApp(null, repos);
    const token = buildFakeJwt(VALID_APPLE_PAYLOAD);

    const res = await app.request("/trpc/auth.appleSignIn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identityToken: token }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { result?: { data?: { sessionToken: string; isNewUser: boolean } } };
    expect(body.result?.data?.isNewUser).toBe(false);

    appleSignInSpy.mockRestore();
  });
});

const VALID_GOOGLE_PAYLOAD = {
  iss: "https://accounts.google.com",
  aud: "test-google-client-id.apps.googleusercontent.com",
  exp: FUTURE_EXP,
  sub: "google-user-001",
  email: "user@gmail.com",
  email_verified: true,
};

describe("auth.googleSignIn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 500 when repositories not configured", async () => {
    const testRouter = router({ auth: authRouter });
    const app = new Hono();
    app.use(
      "/trpc/*",
      trpcServer({
        router: testRouter,
        createContext: createTrpcContext({}),
      })
    );

    const token = buildFakeJwt(VALID_GOOGLE_PAYLOAD);
    const res = await app.request("/trpc/auth.googleSignIn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken: token }),
    });
    expect(res.status).toBe(500);
  });

  it("returns 500 when Google JWKS provider not configured", async () => {
    const repos = makeRepositories();
    const testRouter = router({ auth: authRouter });
    const app = new Hono();
    const auth = { getCurrentIdentity: async () => null };
    app.use(
      "/trpc/*",
      trpcServer({
        router: testRouter,
        createContext: createTrpcContext({ repositories: repos, auth }),
      })
    );

    const token = buildFakeJwt(VALID_GOOGLE_PAYLOAD);
    const res = await app.request("/trpc/auth.googleSignIn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken: token }),
    });
    expect(res.status).toBe(500);
  });

  it("returns 401 when token has wrong issuer", async () => {
    const repos = makeRepositories();
    const app = buildApp(null, repos);

    const payload = { ...VALID_GOOGLE_PAYLOAD, iss: "https://evil.example.com" };
    const token = buildFakeJwt(payload);

    const res = await app.request("/trpc/auth.googleSignIn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken: token }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 when token is expired", async () => {
    const repos = makeRepositories();
    const app = buildApp(null, repos);

    const expiredPayload = { ...VALID_GOOGLE_PAYLOAD, exp: Math.floor(Date.now() / 1000) - 10 };
    const token = buildFakeJwt(expiredPayload);

    const res = await app.request("/trpc/auth.googleSignIn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken: token }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 when token has wrong audience", async () => {
    const repos = makeRepositories();
    const app = buildApp(null, repos);

    const payload = { ...VALID_GOOGLE_PAYLOAD, aud: "com.wrong.app" };
    const token = buildFakeJwt(payload);

    const res = await app.request("/trpc/auth.googleSignIn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken: token }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 when token does not have three parts", async () => {
    const repos = makeRepositories();
    const app = buildApp(null, repos);

    const res = await app.request("/trpc/auth.googleSignIn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken: "notavalidjwt" }),
    });
    expect(res.status).toBe(401);
  });

  it("creates a new identity and session for a new Google user (mocked service)", async () => {
    const mockSession: Session = {
      tokenHash: "abc123hash",
      profileId: UUID1,
      expiresAt: new Date(Date.now() + 86400000),
    };
    const mockIdentity: OAuthIdentity = {
      provider: "google",
      providerUserId: VALID_GOOGLE_PAYLOAD.sub,
      profileId: UUID1,
    };

    const repos = makeRepositories({
      authIdentities: {
        create: vi.fn().mockResolvedValue(mockIdentity),
        findByProvider: vi.fn().mockResolvedValue(null),
        listByProfile: vi.fn(),
      },
      sessions: {
        create: vi.fn().mockResolvedValue(mockSession),
        findByTokenHash: vi.fn(),
        revokeByTokenHash: vi.fn(),
        revokeAllForProfile: vi.fn(),
      },
    });

    const { AuthService } = await import("@hone/domain");
    const googleSignInSpy = vi.spyOn(AuthService.prototype, "googleSignIn").mockResolvedValue({
      sessionToken: "raw-google-token-abc",
      expiresAt: mockSession.expiresAt,
      isNewUser: true,
    });

    const app = buildApp(null, repos);
    const token = buildFakeJwt(VALID_GOOGLE_PAYLOAD);

    const res = await app.request("/trpc/auth.googleSignIn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken: token }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { result?: { data?: { sessionToken: string; isNewUser: boolean } } };
    expect(body.result?.data?.sessionToken).toBe("raw-google-token-abc");
    expect(body.result?.data?.isNewUser).toBe(true);

    googleSignInSpy.mockRestore();
  });

  it("links existing identity and returns isNewUser=false (mocked service)", async () => {
    const existingSession: Session = {
      tokenHash: "existing-hash",
      profileId: UUID1,
      expiresAt: new Date(Date.now() + 86400000),
    };

    const repos = makeRepositories({
      authIdentities: {
        create: vi.fn(),
        findByProvider: vi.fn(),
        listByProfile: vi.fn(),
      },
      sessions: {
        create: vi.fn(),
        findByTokenHash: vi.fn(),
        revokeByTokenHash: vi.fn(),
        revokeAllForProfile: vi.fn(),
      },
    });

    const { AuthService } = await import("@hone/domain");
    const googleSignInSpy = vi.spyOn(AuthService.prototype, "googleSignIn").mockResolvedValue({
      sessionToken: "raw-google-token-xyz",
      expiresAt: existingSession.expiresAt,
      isNewUser: false,
    });

    const app = buildApp(null, repos);
    const token = buildFakeJwt(VALID_GOOGLE_PAYLOAD);

    const res = await app.request("/trpc/auth.googleSignIn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken: token }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { result?: { data?: { sessionToken: string; isNewUser: boolean } } };
    expect(body.result?.data?.isNewUser).toBe(false);

    googleSignInSpy.mockRestore();
  });
});

describe("auth.requestMagicLink", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 500 when repositories not configured", async () => {
    const testRouter = router({ auth: authRouter });
    const app = new Hono();
    app.use(
      "/trpc/*",
      trpcServer({
        router: testRouter,
        createContext: createTrpcContext({}),
      })
    );

    const res = await app.request("/trpc/auth.requestMagicLink", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "user@example.com" }),
    });
    expect(res.status).toBe(500);
  });

  it("returns 500 when email provider not configured", async () => {
    const repos = makeRepositories();
    const testRouter = router({ auth: authRouter });
    const app = new Hono();
    const auth = { getCurrentIdentity: async () => null };
    app.use(
      "/trpc/*",
      trpcServer({
        router: testRouter,
        createContext: createTrpcContext({ repositories: repos, auth }),
      })
    );

    const res = await app.request("/trpc/auth.requestMagicLink", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "user@example.com" }),
    });
    expect(res.status).toBe(500);
  });

  it("returns 400 when email is invalid", async () => {
    const repos = makeRepositories();
    const emailProvider = { sendMagicLink: vi.fn() };
    const app = buildAppWithEmail(null, repos, emailProvider);

    const res = await app.request("/trpc/auth.requestMagicLink", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "not-an-email" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 200 with expiresAt on success", async () => {
    const repos = makeRepositories();
    repos.magicLinks.create = vi.fn().mockResolvedValue({
      email: "user@example.com",
      tokenHash: "abc",
      expiresAt: new Date(Date.now() + 600000),
    });
    repos.magicLinks.deleteExpiredForEmail = vi.fn();
    const emailProvider = { sendMagicLink: vi.fn().mockResolvedValue(undefined) };
    const app = buildAppWithEmail(null, repos, emailProvider);

    const res = await app.request("/trpc/auth.requestMagicLink", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "user@example.com" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { result?: { data?: { expiresAt: string } } };
    expect(body.result?.data?.expiresAt).toBeDefined();
  });
});

describe("auth.consumeMagicLink", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 500 when repositories not configured", async () => {
    const testRouter = router({ auth: authRouter });
    const app = new Hono();
    app.use(
      "/trpc/*",
      trpcServer({
        router: testRouter,
        createContext: createTrpcContext({}),
      })
    );

    const res = await app.request("/trpc/auth.consumeMagicLink", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "some-token" }),
    });
    expect(res.status).toBe(500);
  });

  it("returns 401 when token is invalid", async () => {
    const repos = makeRepositories();
    repos.magicLinks.findByTokenHash = vi.fn().mockResolvedValue(null);
    const emailProvider = { sendMagicLink: vi.fn() };
    const app = buildAppWithEmail(null, repos, emailProvider);

    const res = await app.request("/trpc/auth.consumeMagicLink", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "invalid-token" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 when token is expired", async () => {
    const repos = makeRepositories();
    repos.magicLinks.findByTokenHash = vi.fn().mockResolvedValue({
      email: "user@example.com",
      tokenHash: "hashed",
      expiresAt: new Date(Date.now() - 1000),
      consumedAt: undefined,
    });
    const emailProvider = { sendMagicLink: vi.fn() };
    const app = buildAppWithEmail(null, repos, emailProvider);

    const res = await app.request("/trpc/auth.consumeMagicLink", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "expired-token" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 when token already consumed", async () => {
    const repos = makeRepositories();
    repos.magicLinks.findByTokenHash = vi.fn().mockResolvedValue({
      email: "user@example.com",
      tokenHash: "hashed",
      expiresAt: new Date(Date.now() + 600000),
      consumedAt: new Date(),
    });
    const emailProvider = { sendMagicLink: vi.fn() };
    const app = buildAppWithEmail(null, repos, emailProvider);

    const res = await app.request("/trpc/auth.consumeMagicLink", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "used-token" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 200 with sessionToken and isNewUser=true for new user", async () => {
    const repos = makeRepositories();
    repos.magicLinks.findByTokenHash = vi.fn().mockResolvedValue({
      email: "newuser@example.com",
      tokenHash: "hashed",
      expiresAt: new Date(Date.now() + 600000),
      consumedAt: undefined,
    });
    repos.magicLinks.markConsumed = vi.fn();
    repos.authIdentities.findByProvider = vi.fn().mockResolvedValue(null);
    repos.authIdentities.create = vi.fn().mockResolvedValue({
      provider: "email",
      providerUserId: "newuser@example.com",
      profileId: "00000000-0000-0000-0000-000000000099",
    });
    repos.sessions.create = vi.fn().mockResolvedValue({
      tokenHash: "session-hash",
      profileId: "00000000-0000-0000-0000-000000000099",
      expiresAt: new Date(Date.now() + 86400000),
    });
    const emailProvider = { sendMagicLink: vi.fn() };
    const app = buildAppWithEmail(null, repos, emailProvider);

    const res = await app.request("/trpc/auth.consumeMagicLink", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "valid-token" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { result?: { data?: { sessionToken: string; isNewUser: boolean; expiresAt: string } } };
    expect(body.result?.data?.sessionToken).toBeDefined();
    expect(body.result?.data?.isNewUser).toBe(true);
    expect(body.result?.data?.expiresAt).toBeDefined();
  });

  it("returns 200 with isNewUser=false for existing user", async () => {
    const repos = makeRepositories();
    repos.magicLinks.findByTokenHash = vi.fn().mockResolvedValue({
      email: "existing@example.com",
      tokenHash: "hashed",
      expiresAt: new Date(Date.now() + 600000),
      consumedAt: undefined,
    });
    repos.magicLinks.markConsumed = vi.fn();
    repos.authIdentities.findByProvider = vi.fn().mockResolvedValue({
      provider: "email",
      providerUserId: "existing@example.com",
      profileId: UUID1,
    });
    repos.sessions.create = vi.fn().mockResolvedValue({
      tokenHash: "session-hash",
      profileId: UUID1,
      expiresAt: new Date(Date.now() + 86400000),
    });
    const emailProvider = { sendMagicLink: vi.fn() };
    const app = buildAppWithEmail(null, repos, emailProvider);

    const res = await app.request("/trpc/auth.consumeMagicLink", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "valid-token" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { result?: { data?: { sessionToken: string; isNewUser: boolean } } };
    expect(body.result?.data?.isNewUser).toBe(false);
  });
});

function buildAppWithSms(
  repositories: AppRepositories,
  smsProvider: { sendVerificationCode: ReturnType<typeof vi.fn> }
) {
  const testRouter = router({ auth: authRouter });
  const app = new Hono();
  const auth = { getCurrentIdentity: async () => null };
  const mockJwksProvider: AppleJwksProvider = { fetchKeys: vi.fn().mockResolvedValue([]) };
  const mockGoogleJwksProvider: GoogleJwksProvider = { fetchKeys: vi.fn().mockResolvedValue([]) };
  app.use(
    "/trpc/*",
    trpcServer({
      router: testRouter,
      createContext: createTrpcContext({
        repositories,
        auth,
        jwksProvider: mockJwksProvider,
        appleAudience: "com.hone.app",
        googleJwksProvider: mockGoogleJwksProvider,
        googleAudience: "test-google-client-id.apps.googleusercontent.com",
        smsProvider,
      }),
    })
  );
  return app;
}

describe("auth.startPhoneVerify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 500 when repositories not configured", async () => {
    const testRouter = router({ auth: authRouter });
    const app = new Hono();
    app.use(
      "/trpc/*",
      trpcServer({
        router: testRouter,
        createContext: createTrpcContext({}),
      })
    );

    const res = await app.request("/trpc/auth.startPhoneVerify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phoneNumber: "+12025551234" }),
    });
    expect(res.status).toBe(500);
  });

  it("returns 500 when SMS provider not configured", async () => {
    const repos = makeRepositories();
    const testRouter = router({ auth: authRouter });
    const app = new Hono();
    const auth = { getCurrentIdentity: async () => null };
    app.use(
      "/trpc/*",
      trpcServer({
        router: testRouter,
        createContext: createTrpcContext({ repositories: repos, auth }),
      })
    );

    const res = await app.request("/trpc/auth.startPhoneVerify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phoneNumber: "+12025551234" }),
    });
    expect(res.status).toBe(500);
  });

  it("returns 200 with expiresAt on success (mocked service)", async () => {
    const repos = makeRepositories();
    const smsProvider = { sendVerificationCode: vi.fn().mockResolvedValue(undefined) };
    const app = buildAppWithSms(repos, smsProvider);

    const { PhoneVerifyService } = await import("@hone/domain");
    const startSpy = vi.spyOn(PhoneVerifyService.prototype, "startVerification").mockResolvedValue({
      expiresAt: new Date(Date.now() + 600000),
    });

    const res = await app.request("/trpc/auth.startPhoneVerify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phoneNumber: "+12025551234" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { result?: { data?: { expiresAt: string } } };
    expect(body.result?.data?.expiresAt).toBeDefined();

    startSpy.mockRestore();
  });

  it("returns 400 when phone number is invalid (mocked service)", async () => {
    const repos = makeRepositories();
    const smsProvider = { sendVerificationCode: vi.fn() };
    const app = buildAppWithSms(repos, smsProvider);

    const { PhoneVerifyService } = await import("@hone/domain");
    const startSpy = vi.spyOn(PhoneVerifyService.prototype, "startVerification").mockRejectedValue(
      Object.assign(new Error("Invalid phone number"), { code: "INVALID_PHONE" })
    );

    const res = await app.request("/trpc/auth.startPhoneVerify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phoneNumber: "not-a-phone" }),
    });
    expect(res.status).toBe(400);

    startSpy.mockRestore();
  });

  it("returns 429 when rate limited (SMS pumping protection)", async () => {
    const repos = makeRepositories();
    const smsProvider = { sendVerificationCode: vi.fn() };
    const app = buildAppWithSms(repos, smsProvider);

    const { PhoneVerifyService } = await import("@hone/domain");
    const startSpy = vi.spyOn(PhoneVerifyService.prototype, "startVerification").mockRejectedValue(
      Object.assign(new Error("Too many verification attempts. Try again later."), { code: "RATE_LIMITED" })
    );

    const res = await app.request("/trpc/auth.startPhoneVerify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phoneNumber: "+12025551234" }),
    });
    expect(res.status).toBe(429);

    startSpy.mockRestore();
  });
});

describe("auth.confirmPhoneVerify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 500 when repositories not configured", async () => {
    const testRouter = router({ auth: authRouter });
    const app = new Hono();
    app.use(
      "/trpc/*",
      trpcServer({
        router: testRouter,
        createContext: createTrpcContext({}),
      })
    );

    const res = await app.request("/trpc/auth.confirmPhoneVerify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phoneNumber: "+12025551234", code: "123456" }),
    });
    expect(res.status).toBe(500);
  });

  it("returns 401 when no viewer (not authenticated)", async () => {
    const repos = makeRepositories();
    const smsProvider = { sendVerificationCode: vi.fn() };
    const app = buildAppWithSms(repos, smsProvider);

    const res = await app.request("/trpc/auth.confirmPhoneVerify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phoneNumber: "+12025551234", code: "123456" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 200 with verified=true on success (mocked service)", async () => {
    const repos = makeRepositories();
    // Set up session so viewer is populated
    repos.sessions.findByTokenHash = vi.fn().mockResolvedValue({
      tokenHash: "test-hash",
      profileId: UUID1,
      expiresAt: new Date(Date.now() + 86400000),
    });
    repos.profiles.findById = vi.fn().mockResolvedValue({
      id: UUID1,
      handle: "testuser",
      displayName: "Test User",
      defaultVisibility: {},
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const smsProvider = { sendVerificationCode: vi.fn() };
    const testRouter = router({ auth: authRouter });
    const app = new Hono();
    const auth = { getCurrentIdentity: async () => null };
    const mockJwksProvider: AppleJwksProvider = { fetchKeys: vi.fn().mockResolvedValue([]) };
    const mockGoogleJwksProvider: GoogleJwksProvider = { fetchKeys: vi.fn().mockResolvedValue([]) };
    app.use(
      "/trpc/*",
      trpcServer({
        router: testRouter,
        createContext: createTrpcContext({
          repositories: repos,
          auth,
          jwksProvider: mockJwksProvider,
          appleAudience: "com.hone.app",
          googleJwksProvider: mockGoogleJwksProvider,
          googleAudience: "test-google-client-id.apps.googleusercontent.com",
          smsProvider,
        }),
      })
    );

    const { PhoneVerifyService } = await import("@hone/domain");
    const confirmSpy = vi.spyOn(PhoneVerifyService.prototype, "confirmVerification").mockResolvedValue({
      verified: true,
    });

    // Create a fake session token hash
    const { createHash } = await import("node:crypto");
    const rawToken = "test-session-token";
    const tokenHash = createHash("sha256").update(rawToken, "utf8").digest("hex");
    repos.sessions.findByTokenHash = vi.fn().mockResolvedValue({
      tokenHash,
      profileId: UUID1,
      expiresAt: new Date(Date.now() + 86400000),
    });

    const res = await app.request("/trpc/auth.confirmPhoneVerify", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${rawToken}`,
      },
      body: JSON.stringify({ phoneNumber: "+12025551234", code: "123456" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { result?: { data?: { verified: boolean } } };
    expect(body.result?.data?.verified).toBe(true);

    confirmSpy.mockRestore();
  });

  it("returns 400 when phone is invalid (mocked service)", async () => {
    const repos = makeRepositories();
    repos.sessions.findByTokenHash = vi.fn().mockResolvedValue({
      tokenHash: "test-hash",
      profileId: UUID1,
      expiresAt: new Date(Date.now() + 86400000),
    });
    repos.profiles.findById = vi.fn().mockResolvedValue({
      id: UUID1,
      handle: "testuser",
      displayName: "Test User",
      defaultVisibility: {},
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const smsProvider = { sendVerificationCode: vi.fn() };
    const testRouter = router({ auth: authRouter });
    const app = new Hono();
    const auth = { getCurrentIdentity: async () => null };
    app.use(
      "/trpc/*",
      trpcServer({
        router: testRouter,
        createContext: createTrpcContext({
          repositories: repos,
          auth,
          jwksProvider: { fetchKeys: vi.fn().mockResolvedValue([]) },
          appleAudience: "com.hone.app",
          googleJwksProvider: { fetchKeys: vi.fn().mockResolvedValue([]) },
          googleAudience: "test-google-client-id.apps.googleusercontent.com",
          smsProvider,
        }),
      })
    );

    const { PhoneVerifyService } = await import("@hone/domain");
    const confirmSpy = vi.spyOn(PhoneVerifyService.prototype, "confirmVerification").mockRejectedValue(
      Object.assign(new Error("Invalid phone number"), { code: "INVALID_PHONE" })
    );

    const { createHash } = await import("node:crypto");
    const rawToken = "test-session-token";
    const tokenHash = createHash("sha256").update(rawToken, "utf8").digest("hex");
    repos.sessions.findByTokenHash = vi.fn().mockResolvedValue({
      tokenHash,
      profileId: UUID1,
      expiresAt: new Date(Date.now() + 86400000),
    });

    const res = await app.request("/trpc/auth.confirmPhoneVerify", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${rawToken}`,
      },
      body: JSON.stringify({ phoneNumber: "invalid", code: "123456" }),
    });
    expect(res.status).toBe(400);

    confirmSpy.mockRestore();
  });

  it("returns 429 after 3 wrong attempts (mocked service)", async () => {
    const repos = makeRepositories();
    repos.sessions.findByTokenHash = vi.fn().mockResolvedValue({
      tokenHash: "test-hash",
      profileId: UUID1,
      expiresAt: new Date(Date.now() + 86400000),
    });
    repos.profiles.findById = vi.fn().mockResolvedValue({
      id: UUID1,
      handle: "testuser",
      displayName: "Test User",
      defaultVisibility: {},
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const smsProvider = { sendVerificationCode: vi.fn() };
    const testRouter = router({ auth: authRouter });
    const app = new Hono();
    const auth = { getCurrentIdentity: async () => null };
    app.use(
      "/trpc/*",
      trpcServer({
        router: testRouter,
        createContext: createTrpcContext({
          repositories: repos,
          auth,
          jwksProvider: { fetchKeys: vi.fn().mockResolvedValue([]) },
          appleAudience: "com.hone.app",
          googleJwksProvider: { fetchKeys: vi.fn().mockResolvedValue([]) },
          googleAudience: "test-google-client-id.apps.googleusercontent.com",
          smsProvider,
        }),
      })
    );

    const { PhoneVerifyService } = await import("@hone/domain");
    const confirmSpy = vi.spyOn(PhoneVerifyService.prototype, "confirmVerification").mockRejectedValue(
      Object.assign(new Error("Too many failed attempts. Request a new code."), { code: "RATE_LIMITED" })
    );

    const { createHash } = await import("node:crypto");
    const rawToken = "test-session-token";
    const tokenHash = createHash("sha256").update(rawToken, "utf8").digest("hex");
    repos.sessions.findByTokenHash = vi.fn().mockResolvedValue({
      tokenHash,
      profileId: UUID1,
      expiresAt: new Date(Date.now() + 86400000),
    });

    const res = await app.request("/trpc/auth.confirmPhoneVerify", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${rawToken}`,
      },
      body: JSON.stringify({ phoneNumber: "+12025551234", code: "000000" }),
    });
    expect(res.status).toBe(429);

    confirmSpy.mockRestore();
  });
});

describe("auth.session.create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 500 when repositories not configured", async () => {
    const testRouter = router({ auth: authRouter });
    const app = new Hono();
    app.use(
      "/trpc/*",
      trpcServer({
        router: testRouter,
        createContext: createTrpcContext({}),
      })
    );

    const res = await app.request("/trpc/auth.session.create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ profileId: UUID1 }),
    });
    expect(res.status).toBe(500);
  });

  it("returns 200 with sessionToken and expiresAt on success", async () => {
    const repos = makeRepositories();
    repos.sessions.create = vi.fn().mockResolvedValue({
      tokenHash: "some-hash",
      profileId: UUID1,
      expiresAt: new Date(Date.now() + 86400000),
    });

    const app = buildApp(null, repos);

    const res = await app.request("/trpc/auth.session.create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ profileId: UUID1 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { result?: { data?: { sessionToken: string; expiresAt: string } } };
    expect(body.result?.data?.sessionToken).toBeDefined();
    expect(body.result?.data?.sessionToken.length).toBe(64);
    expect(body.result?.data?.expiresAt).toBeDefined();
  });

  it("returns 400 when profileId is not a valid UUID", async () => {
    const repos = makeRepositories();
    const app = buildApp(null, repos);

    const res = await app.request("/trpc/auth.session.create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ profileId: "not-a-uuid" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("auth.session.rotate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 500 when repositories not configured", async () => {
    const testRouter = router({ auth: authRouter });
    const app = new Hono();
    app.use(
      "/trpc/*",
      trpcServer({
        router: testRouter,
        createContext: createTrpcContext({}),
      })
    );

    const res = await app.request("/trpc/auth.session.rotate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentToken: "some-token" }),
    });
    expect(res.status).toBe(500);
  });

  it("returns 200 with new sessionToken on success", async () => {
    const { createHash } = await import("node:crypto");
    const currentToken = "a".repeat(64);
    const currentHash = createHash("sha256").update(currentToken, "utf8").digest("hex");

    const repos = makeRepositories();
    repos.sessions.findByTokenHash = vi.fn().mockResolvedValue({
      tokenHash: currentHash,
      profileId: UUID1,
      expiresAt: new Date(Date.now() + 86400000),
    });
    repos.sessions.revokeByTokenHash = vi.fn();
    repos.sessions.create = vi.fn().mockResolvedValue({
      tokenHash: "new-hash",
      profileId: UUID1,
      expiresAt: new Date(Date.now() + 86400000),
    });

    const app = buildApp(null, repos);

    const res = await app.request("/trpc/auth.session.rotate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentToken }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { result?: { data?: { sessionToken: string; expiresAt: string } } };
    expect(body.result?.data?.sessionToken).toBeDefined();
    expect(body.result?.data?.sessionToken).not.toBe(currentToken);
    expect(body.result?.data?.expiresAt).toBeDefined();
  });

  it("returns 404 when session not found", async () => {
    const repos = makeRepositories();
    repos.sessions.findByTokenHash = vi.fn().mockResolvedValue(null);

    const app = buildApp(null, repos);

    const res = await app.request("/trpc/auth.session.rotate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentToken: "nonexistent-token" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 401 when session is already revoked", async () => {
    const { createHash } = await import("node:crypto");
    const token = "b".repeat(64);
    const hash = createHash("sha256").update(token, "utf8").digest("hex");

    const repos = makeRepositories();
    repos.sessions.findByTokenHash = vi.fn().mockResolvedValue({
      tokenHash: hash,
      profileId: UUID1,
      expiresAt: new Date(Date.now() + 86400000),
      revokedAt: new Date(),
    });

    const app = buildApp(null, repos);

    const res = await app.request("/trpc/auth.session.rotate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentToken: token }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 when session is expired", async () => {
    const { createHash } = await import("node:crypto");
    const token = "c".repeat(64);
    const hash = createHash("sha256").update(token, "utf8").digest("hex");

    const repos = makeRepositories();
    repos.sessions.findByTokenHash = vi.fn().mockResolvedValue({
      tokenHash: hash,
      profileId: UUID1,
      expiresAt: new Date(Date.now() - 1000),
    });

    const app = buildApp(null, repos);

    const res = await app.request("/trpc/auth.session.rotate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentToken: token }),
    });
    expect(res.status).toBe(401);
  });
});

describe("auth.session.revoke", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 500 when repositories not configured", async () => {
    const testRouter = router({ auth: authRouter });
    const app = new Hono();
    app.use(
      "/trpc/*",
      trpcServer({
        router: testRouter,
        createContext: createTrpcContext({}),
      })
    );

    const res = await app.request("/trpc/auth.session.revoke", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "some-token" }),
    });
    expect(res.status).toBe(500);
  });

  it("returns 200 with revoked=true on success", async () => {
    const { createHash } = await import("node:crypto");
    const rawToken = "d".repeat(64);
    const tokenHash = createHash("sha256").update(rawToken, "utf8").digest("hex");

    const repos = makeRepositories();
    repos.sessions.findByTokenHash = vi.fn().mockResolvedValue({
      tokenHash,
      profileId: UUID1,
      expiresAt: new Date(Date.now() + 86400000),
    });
    repos.sessions.revokeByTokenHash = vi.fn();

    const app = buildApp(null, repos);

    const res = await app.request("/trpc/auth.session.revoke", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: rawToken }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { result?: { data?: { revoked: boolean } } };
    expect(body.result?.data?.revoked).toBe(true);
  });

  it("returns 404 when session not found", async () => {
    const repos = makeRepositories();
    repos.sessions.findByTokenHash = vi.fn().mockResolvedValue(null);

    const app = buildApp(null, repos);

    const res = await app.request("/trpc/auth.session.revoke", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "nonexistent-token" }),
    });
    expect(res.status).toBe(404);
  });
});
