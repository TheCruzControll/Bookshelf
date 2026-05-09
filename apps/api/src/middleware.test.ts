import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { requestIdMiddleware, accessLogMiddleware, otelHook, rateLimitMiddleware } from "./middleware";
import { MemoryCache } from "@hone/cache";

vi.mock("@hone/observability", () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  })
}));

function makeApp() {
  const app = new Hono();
  app.use("*", requestIdMiddleware());
  app.use("*", otelHook());
  app.use("*", accessLogMiddleware());
  app.get("/ping", (c) => c.text("pong"));
  return app;
}

describe("requestIdMiddleware", () => {
  it("generates x-request-id response header when none provided", async () => {
    const app = makeApp();
    const res = await app.request("/ping");
    const id = res.headers.get("x-request-id");
    expect(id).toBeTruthy();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it("echoes the incoming x-request-id in the response", async () => {
    const app = makeApp();
    const res = await app.request("/ping", {
      headers: { "x-request-id": "my-custom-id" }
    });
    expect(res.headers.get("x-request-id")).toBe("my-custom-id");
  });

  it("each request without an id gets a unique id", async () => {
    const app = makeApp();
    const res1 = await app.request("/ping");
    const res2 = await app.request("/ping");
    expect(res1.headers.get("x-request-id")).not.toBe(
      res2.headers.get("x-request-id")
    );
  });
});

describe("otelHook", () => {
  it("sets x-trace-id and x-span-id response headers", async () => {
    const app = makeApp();
    const res = await app.request("/ping");
    expect(res.headers.get("x-trace-id")).toBeTruthy();
    expect(res.headers.get("x-span-id")).toBeTruthy();
  });

  it("trace id is 32 hex chars", async () => {
    const app = makeApp();
    const res = await app.request("/ping");
    const traceId = res.headers.get("x-trace-id")!;
    expect(traceId).toMatch(/^[0-9a-f]{32}$/);
  });

  it("span id is 16 hex chars", async () => {
    const app = makeApp();
    const res = await app.request("/ping");
    const spanId = res.headers.get("x-span-id")!;
    expect(spanId).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("accessLogMiddleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not throw and request completes", async () => {
    const app = makeApp();
    const res = await app.request("/ping");
    expect(res.status).toBe(200);
  });
});

describe("middleware integration in createApi", () => {
  it("health endpoint returns x-request-id header", async () => {
    const { createApi } = await import("./app");
    const app = createApi();
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toBeTruthy();
  });

  it("health endpoint returns x-trace-id and x-span-id headers", async () => {
    const { createApi } = await import("./app");
    const app = createApi();
    const res = await app.request("/health");
    expect(res.headers.get("x-trace-id")).toBeTruthy();
    expect(res.headers.get("x-span-id")).toBeTruthy();
  });

  it("incoming x-request-id is echoed back in health response", async () => {
    const { createApi } = await import("./app");
    const app = createApi();
    const res = await app.request("/health", {
      headers: { "x-request-id": "test-req-id-123" }
    });
    expect(res.headers.get("x-request-id")).toBe("test-req-id-123");
  });
});

describe("rateLimitMiddleware", () => {
  function makeRateLimitApp(maxRequests: number, group: "auth" | "search" | "write" = "write") {
    const cache = new MemoryCache();
    const app = new Hono();
    app.use("*", rateLimitMiddleware(group, cache, { maxRequests, windowMs: 60_000 }));
    app.get("/test", (c) => c.text("ok"));
    return app;
  }

  it("allows requests under the limit", async () => {
    const app = makeRateLimitApp(5);
    const res = await app.request("/test");
    expect(res.status).toBe(200);
  });

  it("returns 429 when limit is exceeded", async () => {
    const app = makeRateLimitApp(2);
    await app.request("/test");
    await app.request("/test");
    const res = await app.request("/test");
    expect(res.status).toBe(429);
  });

  it("429 response includes Retry-After header", async () => {
    const app = makeRateLimitApp(1);
    await app.request("/test");
    const res = await app.request("/test");
    expect(res.status).toBe(429);
    const retryAfter = res.headers.get("retry-after");
    expect(retryAfter).toBeTruthy();
    expect(Number(retryAfter)).toBeGreaterThan(0);
  });

  it("429 response body contains error field", async () => {
    const app = makeRateLimitApp(1);
    await app.request("/test");
    const res = await app.request("/test");
    const body = await res.json();
    expect(body).toMatchObject({ error: "Too Many Requests" });
  });

  it("different IPs are tracked independently", async () => {
    const app = makeRateLimitApp(1);
    const res1 = await app.request("/test", { headers: { "x-forwarded-for": "1.2.3.4" } });
    const res2 = await app.request("/test", { headers: { "x-forwarded-for": "5.6.7.8" } });
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
  });

  it("uses default config for auth group", async () => {
    const cache = new MemoryCache();
    const app = new Hono();
    app.use("*", rateLimitMiddleware("auth", cache));
    app.get("/test", (c) => c.text("ok"));
    const res = await app.request("/test");
    expect(res.status).toBe(200);
  });

  it("uses default config for search group", async () => {
    const cache = new MemoryCache();
    const app = new Hono();
    app.use("*", rateLimitMiddleware("search", cache));
    app.get("/test", (c) => c.text("ok"));
    const res = await app.request("/test");
    expect(res.status).toBe(200);
  });

  it("rate limiter is bypassed when no cache is configured", async () => {
    const { createApi } = await import("./app");
    const app = createApi();
    const res = await app.request("/health");
    expect(res.status).toBe(200);
  });
});
