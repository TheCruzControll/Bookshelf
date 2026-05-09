import type { MiddlewareHandler } from "hono";
import type { Cache } from "@hone/cache";

export type RouteGroup = "auth" | "search" | "write";

export interface RateLimitConfig {
  maxTokens: number;
  windowMs: number;
}

const DEFAULT_CONFIGS: Record<RouteGroup, RateLimitConfig> = {
  auth: { maxTokens: 10, windowMs: 60_000 },
  search: { maxTokens: 60, windowMs: 60_000 },
  write: { maxTokens: 30, windowMs: 60_000 }
};

function buildKey(group: RouteGroup, identifier: string): string {
  return `rate:${group}:${identifier}`;
}

export function createRateLimiter(
  cache: Cache,
  configs: Partial<Record<RouteGroup, RateLimitConfig>> = {}
): (group: RouteGroup) => MiddlewareHandler {
  const resolved: Record<RouteGroup, RateLimitConfig> = {
    auth: configs.auth ?? DEFAULT_CONFIGS.auth,
    search: configs.search ?? DEFAULT_CONFIGS.search,
    write: configs.write ?? DEFAULT_CONFIGS.write
  };

  return (group: RouteGroup): MiddlewareHandler => {
    return async (c, next) => {
      const config = resolved[group];
      const ip =
        c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
        c.req.header("x-real-ip") ??
        "unknown";
      const key = buildKey(group, ip);

      const count = await cache.incr(key, 1, config.windowMs);

      if (count > config.maxTokens) {
        const retryAfterSecs = Math.ceil(config.windowMs / 1000);
        c.header("Retry-After", String(retryAfterSecs));
        return c.json(
          { error: "Too Many Requests", retryAfter: retryAfterSecs },
          429
        );
      }

      c.header("X-RateLimit-Limit", String(config.maxTokens));
      c.header("X-RateLimit-Remaining", String(Math.max(0, config.maxTokens - count)));

      await next();
    };
  };
}
