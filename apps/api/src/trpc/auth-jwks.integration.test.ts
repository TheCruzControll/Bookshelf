/**
 * Auth integration tests (#66 [E-11]).
 *
 * Drives appleSignIn and googleSignIn end-to-end with the real
 * FetchAppleJwksProvider / FetchGoogleJwksProvider and the real
 * AuthService (no service-method spies). HTTP traffic is intercepted
 * via vi.stubGlobal("fetch", ...) — equivalent in scope to msw-style
 * request mocking but without the dev-dep cost.
 *
 * The signing happens with real RSA-256 keypairs generated per test
 * so the WebCrypto verify path is exercised, not bypassed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { trpcServer } from "@hono/trpc-server";
import { subtle } from "node:crypto";
import { FetchAppleJwksProvider, FetchGoogleJwksProvider } from "../app";
import { createTrpcContext } from "./context";
import { router } from "./trpc";
import { authRouter } from "./auth";
import type { AppRepositories, AppleJwk, GoogleJwk } from "@hone/domain";

vi.mock("@hone/observability", () => ({
  captureException: vi.fn(),
  createLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn() })),
  initSentry: vi.fn(),
  setSentryUser: vi.fn(),
  clearSentryUser: vi.fn(),
}));

const APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys";
const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const APPLE_AUDIENCE = "com.hone.app";
const GOOGLE_AUDIENCE = "google-client-id";
const APPLE_ISSUER = "https://appleid.apple.com";
const GOOGLE_ISSUER = "https://accounts.google.com";

// ---------------------------------------------------------------------------
// Key + token helpers
// ---------------------------------------------------------------------------

interface SigningContext {
  jwk: AppleJwk;
  privateKey: CryptoKey;
}

async function generateRsaSigningContext(kid: string): Promise<SigningContext> {
  const kp = (await subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )) as { privateKey: CryptoKey; publicKey: CryptoKey };
  const jwkRaw = (await subtle.exportKey("jwk", kp.publicKey)) as JsonWebKey;
  const jwk: AppleJwk = {
    kty: "RSA",
    kid,
    use: "sig",
    alg: "RS256",
    n: jwkRaw.n!,
    e: jwkRaw.e!,
  };
  return { jwk, privateKey: kp.privateKey };
}

function base64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function signJwt(
  ctx: SigningContext,
  payload: Record<string, unknown>,
): Promise<string> {
  const header = { alg: "RS256", kid: ctx.jwk.kid, typ: "JWT" };
  const headerB64 = base64Url(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = base64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = await subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    ctx.privateKey,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64Url(new Uint8Array(sig))}`;
}

// ---------------------------------------------------------------------------
// Repository fakes
// ---------------------------------------------------------------------------

const STORED_AUTH_IDENTITY = "00000000-0000-0000-0000-000000000010";

function makeRepositories(): AppRepositories {
  const sessions: Array<{ tokenHash: string; profileId: string; expiresAt: Date; revokedAt?: Date }> = [];
  const authIdentities: Array<{
    id: string;
    provider: string;
    providerUserId: string;
    profileId: string;
    email?: string;
  }> = [];

  return {
    accountDeletions: { create: vi.fn(), findByProfileId: vi.fn().mockResolvedValue(null), delete: vi.fn() },
    profiles: { findById: vi.fn(), findByHandle: vi.fn(), create: vi.fn(), isHandleTaken: vi.fn(), setHandle: vi.fn() },
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
    activity: { append: vi.fn(), getFriendFeed: vi.fn(), getFriendFeedGrouped: vi.fn(), deleteByReviewId: vi.fn() },
    recommendations: { getForUser: vi.fn() },
    follows: { follow: vi.fn(), unfollow: vi.fn(), findFollow: vi.fn(), listFollowers: vi.fn(), listFollowing: vi.fn(), isMutual: vi.fn(), countMutuals: vi.fn() },
    blocks: { block: vi.fn(), unblock: vi.fn(), findBlock: vi.fn(), listBlockedByUser: vi.fn(), listBlockingUser: vi.fn(), isBlocked: vi.fn() },
    rankings: { upsert: vi.fn(), findById: vi.fn(), findByOwnerAndBook: vi.fn(), listByOwner: vi.fn(), delete: vi.fn(), startBucket: vi.fn() },
    notifications: { registerToken: vi.fn(), removeToken: vi.fn(), listTokensForProfile: vi.fn(), getSetting: vi.fn(), setSetting: vi.fn(), listSettings: vi.fn() },
    imports: { create: vi.fn(), findById: vi.fn(), findByOwnerAndHash: vi.fn(), listByOwner: vi.fn(), updateStatus: vi.fn() },
    contacts: { upsertHashes: vi.fn(), findMatches: vi.fn(), deleteForUser: vi.fn(), deleteExpired: vi.fn(), listByUser: vi.fn(), expireBySaltVersion: vi.fn(), deleteByTargetHash: vi.fn() },
    emailIndex: { upsertHashes: vi.fn(), findMatches: vi.fn(), deleteForUser: vi.fn(), deleteExpired: vi.fn(), listByUser: vi.fn(), expireBySaltVersion: vi.fn(), deleteByTargetHash: vi.fn() },
    lists: { create: vi.fn(), findById: vi.fn(), listByOwner: vi.fn(), update: vi.fn(), delete: vi.fn(), addItem: vi.fn(), removeItem: vi.fn(), listItems: vi.fn(), reorderItems: vi.fn() },
    authIdentities: {
      create: vi.fn(async (input) => {
        const row = {
          id: STORED_AUTH_IDENTITY,
          provider: input.provider,
          providerUserId: input.providerUserId,
          profileId: input.profileId,
          email: input.email,
        };
        authIdentities.push(row);
        return row;
      }),
      findByProvider: vi.fn(async ({ provider, providerUserId }) => {
        return authIdentities.find((a) => a.provider === provider && a.providerUserId === providerUserId) ?? null;
      }),
      listByProfile: vi.fn(async (profileId) => authIdentities.filter((a) => a.profileId === profileId)),
    },
    sessions: {
      create: vi.fn(async (input) => {
        const row = { tokenHash: input.tokenHash, profileId: input.profileId, expiresAt: input.expiresAt };
        sessions.push(row);
        return row;
      }),
      findByTokenHash: vi.fn(async (tokenHash) => sessions.find((s) => s.tokenHash === tokenHash) ?? null),
      revokeByTokenHash: vi.fn(),
      revokeAllForProfile: vi.fn(),
    },
    handleHistory: { record: vi.fn(), findCurrentByOldHandle: vi.fn() },
    magicLinks: { create: vi.fn(), findByTokenHash: vi.fn(), markConsumed: vi.fn(), deleteExpiredForEmail: vi.fn() },
    inAppNotifications: {
      list: vi.fn().mockResolvedValue([]),
      markRead: vi.fn(),
      findById: vi.fn(),
      countSince: vi.fn().mockResolvedValue(0),
      countSinceByActor: vi.fn().mockResolvedValue(0),
    },
    phoneVerifications: { upsert: vi.fn(), findByPhone: vi.fn(), incrementAttempts: vi.fn(), deleteByPhone: vi.fn(), deleteExpired: vi.fn() },
    phoneNumbers: { upsert: vi.fn(), findByProfileId: vi.fn(), findByHash: vi.fn() },
    salts: { create: vi.fn(), findActive: vi.fn(), findByVersion: vi.fn(), retire: vi.fn(), getLatestVersion: vi.fn(), listAll: vi.fn() },
  };
}

// ---------------------------------------------------------------------------
// App builder
// ---------------------------------------------------------------------------

function buildApp(repositories: AppRepositories) {
  const testRouter = router({ auth: authRouter });
  const app = new Hono();
  const jwksProvider = new FetchAppleJwksProvider();
  const googleJwksProvider = new FetchGoogleJwksProvider();
  const auth = { getCurrentIdentity: async () => null };
  app.use(
    "/trpc/*",
    trpcServer({
      router: testRouter,
      createContext: createTrpcContext({
        repositories,
        auth,
        jwksProvider,
        appleAudience: APPLE_AUDIENCE,
        googleJwksProvider,
        googleAudience: GOOGLE_AUDIENCE,
      }),
    }),
  );
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let appleCtx: SigningContext;
let googleCtx: SigningContext;
let realFetch: typeof globalThis.fetch;

function setupFetchStub(opts: {
  appleKeys?: AppleJwk[];
  googleKeys?: GoogleJwk[];
} = {}) {
  const appleKeys = opts.appleKeys ?? [appleCtx.jwk];
  const googleKeys = opts.googleKeys ?? [googleCtx.jwk];
  const stub = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url === APPLE_JWKS_URL) {
      return new Response(JSON.stringify({ keys: appleKeys }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url === GOOGLE_JWKS_URL) {
      return new Response(JSON.stringify({ keys: googleKeys }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return realFetch(input as RequestInfo);
  });
  vi.stubGlobal("fetch", stub);
  return stub;
}

beforeEach(async () => {
  appleCtx = await generateRsaSigningContext("apple-key-1");
  googleCtx = await generateRsaSigningContext("google-key-1");
  realFetch = globalThis.fetch;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("auth.appleSignIn — JWKS HTTP integration", () => {
  it("happy path: returns a sessionToken and isNewUser=true on first sign-in", async () => {
    setupFetchStub();
    const repos = makeRepositories();
    const app = buildApp(repos);

    const now = Math.floor(Date.now() / 1000);
    const token = await signJwt(appleCtx, {
      iss: APPLE_ISSUER,
      aud: APPLE_AUDIENCE,
      sub: "apple-user-1",
      iat: now,
      exp: now + 3600,
      email: "user@example.com",
    });

    const res = await app.request("/trpc/auth.appleSignIn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identityToken: token }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.isNewUser).toBe(true);
    expect(typeof body.result.data.sessionToken).toBe("string");
    expect(body.result.data.sessionToken.length).toBeGreaterThan(0);
  });

  it("returns isNewUser=false for an existing identity", async () => {
    setupFetchStub();
    const repos = makeRepositories();
    const app = buildApp(repos);

    const now = Math.floor(Date.now() / 1000);
    const token = async () =>
      signJwt(appleCtx, {
        iss: APPLE_ISSUER,
        aud: APPLE_AUDIENCE,
        sub: "apple-user-1",
        iat: now,
        exp: now + 3600,
      });

    await app.request("/trpc/auth.appleSignIn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identityToken: await token() }),
    });
    const res = await app.request("/trpc/auth.appleSignIn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identityToken: await token() }),
    });
    const body = await res.json();
    expect(body.result.data.isNewUser).toBe(false);
  });

  it("rejects tokens with wrong issuer", async () => {
    setupFetchStub();
    const repos = makeRepositories();
    const app = buildApp(repos);
    const now = Math.floor(Date.now() / 1000);
    const token = await signJwt(appleCtx, {
      iss: "https://evil.example.com",
      aud: APPLE_AUDIENCE,
      sub: "apple-user-bad-iss",
      iat: now,
      exp: now + 3600,
    });
    const res = await app.request("/trpc/auth.appleSignIn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identityToken: token }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("rejects tokens with wrong audience", async () => {
    setupFetchStub();
    const app = buildApp(makeRepositories());
    const now = Math.floor(Date.now() / 1000);
    const token = await signJwt(appleCtx, {
      iss: APPLE_ISSUER,
      aud: "com.evil.app",
      sub: "apple-user-bad-aud",
      iat: now,
      exp: now + 3600,
    });
    const res = await app.request("/trpc/auth.appleSignIn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identityToken: token }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("rejects expired tokens", async () => {
    setupFetchStub();
    const app = buildApp(makeRepositories());
    const past = Math.floor(Date.now() / 1000) - 3600;
    const token = await signJwt(appleCtx, {
      iss: APPLE_ISSUER,
      aud: APPLE_AUDIENCE,
      sub: "apple-user-exp",
      iat: past - 60,
      exp: past, // expired
    });
    const res = await app.request("/trpc/auth.appleSignIn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identityToken: token }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("rejects tokens when JWKS returns no matching kid", async () => {
    const otherCtx = await generateRsaSigningContext("apple-key-other");
    setupFetchStub({ appleKeys: [otherCtx.jwk] });
    const app = buildApp(makeRepositories());
    const now = Math.floor(Date.now() / 1000);
    const token = await signJwt(appleCtx, {
      iss: APPLE_ISSUER,
      aud: APPLE_AUDIENCE,
      sub: "apple-user-no-kid",
      iat: now,
      exp: now + 3600,
    });
    const res = await app.request("/trpc/auth.appleSignIn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identityToken: token }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("rejects tokens with a bad signature (signed by different key, same kid claim)", async () => {
    // Sign with a private key whose public key is NOT in JWKS, but advertise the wrong kid
    // so the JWKS lookup succeeds but signature verification fails.
    const evilCtx = await generateRsaSigningContext(appleCtx.jwk.kid); // same kid
    setupFetchStub({ appleKeys: [appleCtx.jwk] });
    const app = buildApp(makeRepositories());
    const now = Math.floor(Date.now() / 1000);
    const token = await signJwt(evilCtx, {
      iss: APPLE_ISSUER,
      aud: APPLE_AUDIENCE,
      sub: "apple-user-bad-sig",
      iat: now,
      exp: now + 3600,
    });
    const res = await app.request("/trpc/auth.appleSignIn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identityToken: token }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("rejects when nonce is provided but does not match", async () => {
    setupFetchStub();
    const app = buildApp(makeRepositories());
    const now = Math.floor(Date.now() / 1000);
    const token = await signJwt(appleCtx, {
      iss: APPLE_ISSUER,
      aud: APPLE_AUDIENCE,
      sub: "apple-user-nonce",
      iat: now,
      exp: now + 3600,
      nonce: "actual-nonce",
    });
    const res = await app.request("/trpc/auth.appleSignIn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identityToken: token, nonce: "expected-nonce" }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe("auth.googleSignIn — JWKS HTTP integration", () => {
  it("happy path: returns a sessionToken and isNewUser=true on first sign-in", async () => {
    setupFetchStub();
    const repos = makeRepositories();
    const app = buildApp(repos);

    const now = Math.floor(Date.now() / 1000);
    const token = await signJwt(googleCtx, {
      iss: GOOGLE_ISSUER,
      aud: GOOGLE_AUDIENCE,
      sub: "google-user-1",
      iat: now,
      exp: now + 3600,
      email: "user@example.com",
      email_verified: true,
    });

    const res = await app.request("/trpc/auth.googleSignIn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken: token }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.isNewUser).toBe(true);
    expect(typeof body.result.data.sessionToken).toBe("string");
  });

  it("rejects tokens with wrong issuer", async () => {
    setupFetchStub();
    const app = buildApp(makeRepositories());
    const now = Math.floor(Date.now() / 1000);
    const token = await signJwt(googleCtx, {
      iss: "https://evil.example.com",
      aud: GOOGLE_AUDIENCE,
      sub: "google-bad-iss",
      iat: now,
      exp: now + 3600,
    });
    const res = await app.request("/trpc/auth.googleSignIn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken: token }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("rejects expired tokens", async () => {
    setupFetchStub();
    const app = buildApp(makeRepositories());
    const past = Math.floor(Date.now() / 1000) - 3600;
    const token = await signJwt(googleCtx, {
      iss: GOOGLE_ISSUER,
      aud: GOOGLE_AUDIENCE,
      sub: "google-exp",
      iat: past - 60,
      exp: past,
    });
    const res = await app.request("/trpc/auth.googleSignIn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken: token }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
