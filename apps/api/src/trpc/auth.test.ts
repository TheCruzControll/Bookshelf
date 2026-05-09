import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { trpcServer } from "@hono/trpc-server";
import { createTrpcContext } from "./context";
import { router } from "./trpc";
import { createAuthRouter } from "./auth";
import type { AppRepositories, AuthIdentity, PhoneVerification, SmsProvider } from "@hone/domain";
import { hashOtp } from "@hone/domain";

vi.mock("@hone/observability", () => ({
  captureException: vi.fn(),
  createLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn() })),
  initSentry: vi.fn(),
  setSentryUser: vi.fn(),
  clearSentryUser: vi.fn(),
}));

const NOW = new Date("2026-01-01T00:00:00Z");
const EXPIRES_AT = new Date(NOW.getTime() + 10 * 60 * 1000);

function makePhoneVerification(overrides?: Partial<PhoneVerification>): PhoneVerification {
  return {
    phoneE164: "+14155551234",
    codeHash: hashOtp("123456"),
    attempts: 0,
    expiresAt: EXPIRES_AT,
    ...overrides,
  };
}

function makeRepositories(overrides?: Partial<AppRepositories>): AppRepositories {
  const verification = makePhoneVerification();
  return {
    profiles: {
      findById: vi.fn(),
      findByHandle: vi.fn(),
      create: vi.fn(),
      isHandleTaken: vi.fn(),
      setHandle: vi.fn(),
    },
    books: { findBookById: vi.fn(), findEditionByIsbn: vi.fn(), search: vi.fn() },
    shelves: { listShelves: vi.fn(), findById: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), addBook: vi.fn(), rankShelfItem: vi.fn(), createSystemShelves: vi.fn().mockResolvedValue([]) },
    reviews: { create: vi.fn(), update: vi.fn() },
    activity: { append: vi.fn(), getFriendFeed: vi.fn() },
    recommendations: { getForUser: vi.fn() },
    follows: { follow: vi.fn(), unfollow: vi.fn(), findFollow: vi.fn(), listFollowers: vi.fn(), listFollowing: vi.fn(), isMutual: vi.fn() },
    blocks: { block: vi.fn(), unblock: vi.fn(), findBlock: vi.fn(), listBlockedByUser: vi.fn(), isBlocked: vi.fn() },
    rankings: { upsert: vi.fn(), findById: vi.fn(), findByOwnerAndBook: vi.fn(), listByOwner: vi.fn(), delete: vi.fn(), startBucket: vi.fn() },
    notifications: { registerToken: vi.fn(), removeToken: vi.fn(), listTokensForUser: vi.fn() },
    imports: { create: vi.fn(), findById: vi.fn(), findByOwnerAndHash: vi.fn(), listByOwner: vi.fn(), updateStatus: vi.fn() },
    contacts: { upsertHashes: vi.fn(), findMatches: vi.fn(), deleteForUser: vi.fn(), deleteExpired: vi.fn(), listByUser: vi.fn() },
    lists: { create: vi.fn(), findById: vi.fn(), listByOwner: vi.fn(), update: vi.fn(), delete: vi.fn(), addItem: vi.fn(), removeItem: vi.fn(), listItems: vi.fn(), reorderItems: vi.fn() },
    sessions: { create: vi.fn(), findById: vi.fn(), deleteById: vi.fn(), deleteAllForUser: vi.fn() },
    phoneVerifications: {
      upsert: vi.fn().mockResolvedValue(verification),
      findByPhone: vi.fn().mockResolvedValue(verification),
      incrementAttempts: vi.fn().mockResolvedValue({ ...verification, attempts: 1 }),
      delete: vi.fn().mockResolvedValue(undefined),
      deleteExpired: vi.fn().mockResolvedValue(undefined),
      storeVerifiedPhone: vi.fn().mockResolvedValue(undefined),
      ...overrides?.phoneVerifications,
    },
    ...overrides,
  };
}

function makeIdentity(overrides?: Partial<AuthIdentity>): AuthIdentity {
  return {
    userId: "00000000-0000-0000-0000-000000000001",
    ...overrides,
  };
}

function makeSms(): SmsProvider {
  return { sendOtp: vi.fn().mockResolvedValue(undefined) };
}

function buildApp(identity: AuthIdentity | null, repositories: AppRepositories, sms?: SmsProvider) {
  const authRouter = createAuthRouter(sms);
  const testRouter = router({ auth: authRouter });
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

describe("auth.startPhoneVerify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns expiresAt when a valid E.164 number is provided", async () => {
    const sms = makeSms();
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos, sms);

    const res = await app.request("/trpc/auth.startPhoneVerify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "+14155551234" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { result: { data: { expiresAt: string } } };
    expect(body.result.data.expiresAt).toBeDefined();
    expect(repos.phoneVerifications.upsert).toHaveBeenCalledOnce();
    expect(sms.sendOtp).toHaveBeenCalledWith(expect.objectContaining({ to: "+14155551234" }));
  });

  it("normalizes non-E.164 numbers (e.g. national format with country code context)", async () => {
    const sms = makeSms();
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos, sms);

    const res = await app.request("/trpc/auth.startPhoneVerify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "+1 415 555 1234" }),
    });

    expect(res.status).toBe(200);
    expect(sms.sendOtp).toHaveBeenCalledWith(expect.objectContaining({ to: "+14155551234" }));
  });

  it("returns 400 for an invalid phone number", async () => {
    const sms = makeSms();
    const repos = makeRepositories();
    const app = buildApp(makeIdentity(), repos, sms);

    const res = await app.request("/trpc/auth.startPhoneVerify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "notaphone" }),
    });

    expect(res.status).toBe(400);
    expect(sms.sendOtp).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    const sms = makeSms();
    const repos = makeRepositories();
    const app = buildApp(null, repos, sms);

    const res = await app.request("/trpc/auth.startPhoneVerify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "+14155551234" }),
    });

    expect(res.status).toBe(401);
    expect(sms.sendOtp).not.toHaveBeenCalled();
  });
});

describe("auth.confirmPhoneVerify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns verified=true for a correct code", async () => {
    const code = "123456";
    const verification = makePhoneVerification({ codeHash: hashOtp(code), expiresAt: EXPIRES_AT });
    const repos = makeRepositories({
      phoneVerifications: {
        upsert: vi.fn(),
        findByPhone: vi.fn().mockResolvedValue(verification),
        incrementAttempts: vi.fn(),
        delete: vi.fn().mockResolvedValue(undefined),
        deleteExpired: vi.fn(),
        storeVerifiedPhone: vi.fn().mockResolvedValue(undefined),
      },
    });

    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    const app = buildApp(makeIdentity(), repos);

    const res = await app.request("/trpc/auth.confirmPhoneVerify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "+14155551234", code }),
    });

    vi.useRealTimers();

    expect(res.status).toBe(200);
    const body = await res.json() as { result: { data: { verified: boolean } } };
    expect(body.result.data.verified).toBe(true);
    expect(repos.phoneVerifications.storeVerifiedPhone).toHaveBeenCalledOnce();
    expect(repos.phoneVerifications.delete).toHaveBeenCalledWith("+14155551234");
  });

  it("returns verified=false for a wrong code and increments attempts", async () => {
    const verification = makePhoneVerification({ codeHash: hashOtp("999999"), expiresAt: EXPIRES_AT });
    const repos = makeRepositories({
      phoneVerifications: {
        upsert: vi.fn(),
        findByPhone: vi.fn().mockResolvedValue(verification),
        incrementAttempts: vi.fn().mockResolvedValue({ ...verification, attempts: 1 }),
        delete: vi.fn(),
        deleteExpired: vi.fn(),
        storeVerifiedPhone: vi.fn(),
      },
    });

    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    const app = buildApp(makeIdentity(), repos);

    const res = await app.request("/trpc/auth.confirmPhoneVerify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "+14155551234", code: "000000" }),
    });

    vi.useRealTimers();

    expect(res.status).toBe(200);
    const body = await res.json() as { result: { data: { verified: boolean } } };
    expect(body.result.data.verified).toBe(false);
    expect(repos.phoneVerifications.incrementAttempts).toHaveBeenCalledWith("+14155551234");
    expect(repos.phoneVerifications.storeVerifiedPhone).not.toHaveBeenCalled();
  });

  it("returns verified=false when verification not found", async () => {
    const repos = makeRepositories({
      phoneVerifications: {
        upsert: vi.fn(),
        findByPhone: vi.fn().mockResolvedValue(null),
        incrementAttempts: vi.fn(),
        delete: vi.fn(),
        deleteExpired: vi.fn(),
        storeVerifiedPhone: vi.fn(),
      },
    });

    const app = buildApp(makeIdentity(), repos);

    const res = await app.request("/trpc/auth.confirmPhoneVerify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "+14155551234", code: "123456" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { result: { data: { verified: boolean } } };
    expect(body.result.data.verified).toBe(false);
  });

  it("returns verified=false and deletes record when OTP expired", async () => {
    const expiredAt = new Date(NOW.getTime() - 1000);
    const verification = makePhoneVerification({ codeHash: hashOtp("123456"), expiresAt: expiredAt });
    const repos = makeRepositories({
      phoneVerifications: {
        upsert: vi.fn(),
        findByPhone: vi.fn().mockResolvedValue(verification),
        incrementAttempts: vi.fn(),
        delete: vi.fn().mockResolvedValue(undefined),
        deleteExpired: vi.fn(),
        storeVerifiedPhone: vi.fn(),
      },
    });

    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    const app = buildApp(makeIdentity(), repos);

    const res = await app.request("/trpc/auth.confirmPhoneVerify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "+14155551234", code: "123456" }),
    });

    vi.useRealTimers();

    expect(res.status).toBe(200);
    const body = await res.json() as { result: { data: { verified: boolean } } };
    expect(body.result.data.verified).toBe(false);
    expect(repos.phoneVerifications.delete).toHaveBeenCalledWith("+14155551234");
    expect(repos.phoneVerifications.storeVerifiedPhone).not.toHaveBeenCalled();
  });

  it("returns verified=false when max attempts exceeded", async () => {
    const verification = makePhoneVerification({
      codeHash: hashOtp("123456"),
      expiresAt: EXPIRES_AT,
      attempts: 5,
    });
    const repos = makeRepositories({
      phoneVerifications: {
        upsert: vi.fn(),
        findByPhone: vi.fn().mockResolvedValue(verification),
        incrementAttempts: vi.fn(),
        delete: vi.fn(),
        deleteExpired: vi.fn(),
        storeVerifiedPhone: vi.fn(),
      },
    });

    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    const app = buildApp(makeIdentity(), repos);

    const res = await app.request("/trpc/auth.confirmPhoneVerify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "+14155551234", code: "123456" }),
    });

    vi.useRealTimers();

    expect(res.status).toBe(200);
    const body = await res.json() as { result: { data: { verified: boolean } } };
    expect(body.result.data.verified).toBe(false);
    expect(repos.phoneVerifications.storeVerifiedPhone).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    const repos = makeRepositories();
    const app = buildApp(null, repos);

    const res = await app.request("/trpc/auth.confirmPhoneVerify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "+14155551234", code: "123456" }),
    });

    expect(res.status).toBe(401);
  });
});
