import { randomUUID } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import { createLogger } from "@hone/observability";

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
