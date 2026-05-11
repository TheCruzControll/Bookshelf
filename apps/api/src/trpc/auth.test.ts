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
    },
    reviews: { findById: vi.fn(), create: vi.fn(), update: vi.fn() },
    activity: { append: vi.fn(), getFriendFeed: vi.fn() },
    recommendations: { getForUser: vi.fn() },
    follows: { follow: vi.fn(), unfollow: vi.fn(), findFollow: vi.fn(), listFollowers: vi.fn(), listFollowing: vi.fn(), isMutual: vi.fn() },
    blocks: { block: vi.fn(), unblock: vi.fn(), findBlock: vi.fn(), listBlockedByUser: vi.fn(), listBlockingUser: vi.fn(), isBlocked: vi.fn() },
    rankings: { upsert: vi.fn(), findById: vi.fn(), findByOwnerAndBook: vi.fn(), listByOwner: vi.fn(), delete: vi.fn(), startBucket: vi.fn() },
    notifications: { registerToken: vi.fn(), removeToken: vi.fn(), listTokensForProfile: vi.fn(), getSetting: vi.fn(), setSetting: vi.fn(), listSettings: vi.fn() },
    imports: { create: vi.fn(), findById: vi.fn(), findByOwnerAndHash: vi.fn(), listByOwner: vi.fn(), updateStatus: vi.fn() },
    contacts: { upsertHashes: vi.fn(), findMatches: vi.fn(), deleteForUser: vi.fn(), deleteExpired: vi.fn(), listByUser: vi.fn() },
    lists: { create: vi.fn(), findById: vi.fn(), listByOwner: vi.fn(), update: vi.fn(), delete: vi.fn(), addItem: vi.fn(), removeItem: vi.fn(), listItems: vi.fn(), reorderItems: vi.fn() },
    authIdentities: { create: vi.fn(), findByProvider: vi.fn(), listByProfile: vi.fn() },
    sessions: { create: vi.fn(), findByTokenHash: vi.fn(), revokeByTokenHash: vi.fn(), revokeAllForProfile: vi.fn() },
    handleHistory: { record: vi.fn(), findCurrentByOldHandle: vi.fn() },
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
