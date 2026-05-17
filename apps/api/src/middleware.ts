import { randomUUID } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import { createLogger } from "@hone/observability";
import { PROFILE_GONE_CODE } from "@hone/domain";
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

/**
 * Public-profile deletion-state middleware (S-06, #161).
 *
 * tRPC has no `GONE` error code, so the public-profile procedures
 * throw `NOT_FOUND` with a `ProfileGoneError` cause whenever a handle
 * lookup misses but a tombstone is still active. The error formatter
 * tags the wire payload with `data.code === "GONE"`. This middleware
 * sits in front of the matching tRPC routes and, AFTER the procedure
 * runs, rewrites any such response to a `410 Gone` with an entirely
 * empty body (per AC: "410 with no body content").
 *
 * Non-gone responses are passed through unchanged.
 */
export function goneRewriteMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    await next();

    if (c.res.status !== 404) return;

    const contentType = c.res.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("json")) return;

    // Clone before reading so the original response stays intact if the
    // body turns out not to be a gone signal.
    const cloned = c.res.clone();
    let body: unknown;
    try {
      body = await cloned.json();
    } catch {
      return;
    }

    if (!isGonePayload(body)) return;

    // 410 Gone with an empty body. Carry over headers that downstream
    // middleware (request id, tracing) has already set on c.res, but
    // strip any content-length / content-type leftovers from the JSON
    // body so the response is unambiguously empty.
    const headers = new Headers();
    for (const [key, value] of c.res.headers.entries()) {
      const lower = key.toLowerCase();
      if (lower === "content-length" || lower === "content-type") continue;
      headers.set(key, value);
    }
    c.res = new Response(null, { status: 410, headers });
  };
}

/**
 * Detects the wire shape produced by the tRPC error formatter when a
 * procedure throws `NOT_FOUND` with a `ProfileGoneError` cause. The
 * formatter sets `data.code = "GONE"`. tRPC may return a single
 * `{ error: ... }` object or an array of envelopes (batch link).
 */
function isGonePayload(body: unknown): boolean {
  if (Array.isArray(body)) return body.some(isGonePayload);
  if (!body || typeof body !== "object") return false;
  const envelope = body as { error?: { data?: { code?: unknown } } };
  return envelope.error?.data?.code === PROFILE_GONE_CODE;
}

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
