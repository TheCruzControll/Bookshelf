import { describe, it, expect } from "vitest";
import { MemoryCache } from "@hone/cache";
import { createRateLimiter } from "./rate-limiter";
import { Hono } from "hono";

function makeApp(maxTokens: number, windowMs = 60_000) {
  const cache = new MemoryCache();
  const rateLimiter = createRateLimiter(cache, {
    auth: { maxTokens, windowMs },
    search: { maxTokens, windowMs },
    write: { maxTokens, windowMs }
  });

  const app = new Hono();
  app.use("/trpc/:proc{auth\\..*}", rateLimiter("auth"));
  app.use("/trpc/:proc{search\\..*}", rateLimiter("search"));
  app.use("/trpc/:proc{write\\..*}", rateLimiter("write"));
  app.get("/trpc/auth.login", (c) => c.json({ ok: true }));
  app.get("/trpc/search.books", (c) => c.json({ ok: true }));
  app.get("/trpc/write.create", (c) => c.json({ ok: true }));
  app.get("/trpc/other.proc", (c) => c.json({ ok: true }));
  return app;
}

describe("createRateLimiter", () => {
  describe("allowed requests", () => {
    it("allows requests under the limit", async () => {
      const app = makeApp(3);
      const res = await app.request("/trpc/auth.login");
      expect(res.status).toBe(200);
    });

    it("sets X-RateLimit-Limit header", async () => {
      const app = makeApp(5);
      const res = await app.request("/trpc/auth.login");
      expect(res.headers.get("X-RateLimit-Limit")).toBe("5");
    });

    it("decrements X-RateLimit-Remaining with each request", async () => {
      const app = makeApp(5);
      const res1 = await app.request("/trpc/auth.login");
      const res2 = await app.request("/trpc/auth.login");
      expect(res1.headers.get("X-RateLimit-Remaining")).toBe("4");
      expect(res2.headers.get("X-RateLimit-Remaining")).toBe("3");
    });
  });

  describe("rate limit exceeded", () => {
    it("returns 429 when limit exceeded", async () => {
      const app = makeApp(2);
      await app.request("/trpc/auth.login");
      await app.request("/trpc/auth.login");
      const res = await app.request("/trpc/auth.login");
      expect(res.status).toBe(429);
    });

    it("includes Retry-After header on 429", async () => {
      const app = makeApp(1, 30_000);
      await app.request("/trpc/auth.login");
      const res = await app.request("/trpc/auth.login");
      expect(res.headers.get("Retry-After")).toBe("30");
    });

    it("includes error body on 429", async () => {
      const app = makeApp(1);
      await app.request("/trpc/auth.login");
      const res = await app.request("/trpc/auth.login");
      const body = await res.json();
      expect(body).toHaveProperty("error", "Too Many Requests");
      expect(body).toHaveProperty("retryAfter");
    });
  });

  describe("per route group isolation", () => {
    it("auth and search counters are independent", async () => {
      const app = makeApp(2);
      await app.request("/trpc/auth.login");
      await app.request("/trpc/auth.login");
      const exceededAuth = await app.request("/trpc/auth.login");
      const searchRes = await app.request("/trpc/search.books");
      expect(exceededAuth.status).toBe(429);
      expect(searchRes.status).toBe(200);
    });

    it("routes outside groups are not rate-limited", async () => {
      const app = makeApp(1);
      await app.request("/trpc/other.proc");
      await app.request("/trpc/other.proc");
      const res = await app.request("/trpc/other.proc");
      expect(res.status).toBe(200);
    });
  });

  describe("per IP isolation", () => {
    it("counters are separate per IP address", async () => {
      const app = makeApp(1);
      await app.request("/trpc/auth.login", {
        headers: { "x-forwarded-for": "1.2.3.4" }
      });
      const resA = await app.request("/trpc/auth.login", {
        headers: { "x-forwarded-for": "1.2.3.4" }
      });
      const resB = await app.request("/trpc/auth.login", {
        headers: { "x-forwarded-for": "5.6.7.8" }
      });
      expect(resA.status).toBe(429);
      expect(resB.status).toBe(200);
    });

    it("x-real-ip is used when x-forwarded-for is absent", async () => {
      const app = makeApp(1);
      await app.request("/trpc/auth.login", {
        headers: { "x-real-ip": "9.9.9.9" }
      });
      const res = await app.request("/trpc/auth.login", {
        headers: { "x-real-ip": "9.9.9.9" }
      });
      expect(res.status).toBe(429);
    });
  });

  describe("configurable per group", () => {
    it("uses custom config for auth group", async () => {
      const cache = new MemoryCache();
      const rateLimiter = createRateLimiter(cache, {
        auth: { maxTokens: 1, windowMs: 60_000 },
        search: { maxTokens: 100, windowMs: 60_000 },
        write: { maxTokens: 50, windowMs: 60_000 }
      });
      const app = new Hono();
      app.use("/trpc/:proc{auth\\..*}", rateLimiter("auth"));
      app.get("/trpc/auth.login", (c) => c.json({ ok: true }));

      await app.request("/trpc/auth.login");
      const res = await app.request("/trpc/auth.login");
      expect(res.status).toBe(429);
    });

    it("defaults are applied when no config is provided", async () => {
      const cache = new MemoryCache();
      const rateLimiter = createRateLimiter(cache);
      const app = new Hono();
      app.use("/trpc/:proc{auth\\..*}", rateLimiter("auth"));
      app.get("/trpc/auth.login", (c) => c.json({ ok: true }));

      const res = await app.request("/trpc/auth.login");
      expect(res.headers.get("X-RateLimit-Limit")).toBe("10");
    });
  });

  describe("write group", () => {
    it("applies rate limit to write group", async () => {
      const app = makeApp(1);
      await app.request("/trpc/write.create");
      const res = await app.request("/trpc/write.create");
      expect(res.status).toBe(429);
    });
  });
});
