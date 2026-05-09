import { randomUUID } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import { createLogger } from "@hone/observability";
import type { Cache } from "@hone/cache";

const accessLogger = createLogger("hone-api-access");

export function requestIdMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const incoming = c.req.header("x-request-id");
    const requestId = incoming ?? randomUUID();
    c.set("requestId", requestId);
    await next();
    c.res.headers.set("x-request-id", requestId);
  };
}

export function accessLogMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const start = Date.now();
    await next();
    const duration = Date.now() - start;
    const requestId = (c.get("requestId") as string | undefined) ?? "";
    accessLogger.info({
      requestId,
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      duration
    });
  };
}

export interface OtelSpan {
  traceId: string;
  spanId: string;
  requestId: string;
  method: string;
  path: string;
  startTime: number;
}

export function otelHook(): MiddlewareHandler {
  return async (c, next) => {
    const traceId = randomUUID().replace(/-/g, "").slice(0, 32);
    const spanId = randomUUID().replace(/-/g, "").slice(0, 16);
    const requestId = (c.get("requestId") as string | undefined) ?? "";
    const startTime = Date.now();

    c.set("otelSpan", {
      traceId,
      spanId,
      requestId,
      method: c.req.method,
      path: c.req.path,
      startTime
    } satisfies OtelSpan);

    await next();

    c.res.headers.set("x-trace-id", traceId);
    c.res.headers.set("x-span-id", spanId);
  };
}

export type RateLimitGroup = "auth" | "search" | "write";

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

const DEFAULT_RATE_LIMIT_CONFIGS: Record<RateLimitGroup, RateLimitConfig> = {
  auth: { maxRequests: 20, windowMs: 60_000 },
  search: { maxRequests: 60, windowMs: 60_000 },
  write: { maxRequests: 30, windowMs: 60_000 },
};

export function rateLimitMiddleware(
  group: RateLimitGroup,
  cache: Cache,
  config?: RateLimitConfig
): MiddlewareHandler {
  const { maxRequests, windowMs } = config ?? DEFAULT_RATE_LIMIT_CONFIGS[group];

  return async (c, next) => {
    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
      c.req.header("x-real-ip") ??
      "unknown";

    const windowStart = Math.floor(Date.now() / windowMs);
    const key = `rl:${group}:${ip}:${windowStart}`;

    const count = await cache.incr(key, 1, windowMs);

    if (count > maxRequests) {
      const retryAfterSec = Math.ceil(
        (windowMs - (Date.now() % windowMs)) / 1000
      );
      c.res = new Response(JSON.stringify({ error: "Too Many Requests" }), {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(retryAfterSec),
        },
      });
      return;
    }

    await next();
  };
}
