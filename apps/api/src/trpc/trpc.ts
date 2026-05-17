import { initTRPC, TRPCError } from "@trpc/server";
import { ZodError } from "zod";
import { captureException, createLogger } from "@hone/observability";
import {
  PROFILE_GONE_CODE,
  ProfileGoneError,
  VersionConflictError,
} from "@hone/domain";
import type { TrpcContext } from "./context";

const trpcLogger = createLogger("hone-trpc");

const t = initTRPC.context<TrpcContext>().create({
  errorFormatter({ shape, error }) {
    if (error.cause instanceof ZodError) {
      return {
        ...shape,
        message: error.cause.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
        data: {
          ...shape.data,
          stack: undefined,
          zodError: error.cause.flatten()
        }
      };
    }

    if (
      error instanceof TRPCError &&
      error.code === "INTERNAL_SERVER_ERROR"
    ) {
      captureException(error.cause ?? error);
      return {
        ...shape,
        message: "Internal server error",
        data: {
          ...shape.data,
          stack: undefined
        }
      };
    }

    // Surface optimistic-locking conflicts as a typed payload under
    // data.conflict so the client can extract the current value and
    // resource type without parsing the message string.
    if (
      error instanceof TRPCError &&
      error.code === "CONFLICT" &&
      error.cause instanceof VersionConflictError
    ) {
      return {
        ...shape,
        data: {
          ...shape.data,
          stack: undefined,
          conflict: error.cause.toPayload()
        }
      };
    }

    // S-06 (#161): the public-profile route signals "gone" by throwing
    // a NOT_FOUND whose cause is a `ProfileGoneError`. tRPC has no GONE
    // code, so we tag the wire payload with `data.code = "GONE"` and
    // let the Hono adapter (`goneRewriteMiddleware`) rewrite the
    // response to HTTP 410 with an empty body. The message is dropped
    // so the body is empty content-wise even before the rewrite.
    if (
      error instanceof TRPCError &&
      error.code === "NOT_FOUND" &&
      error.cause instanceof ProfileGoneError
    ) {
      return {
        ...shape,
        message: "",
        data: {
          ...shape.data,
          stack: undefined,
          code: PROFILE_GONE_CODE
        }
      };
    }

    return {
      ...shape,
      data: {
        ...shape.data,
        stack: undefined
      }
    };
  }
});

export const router = t.router;

const tracingMiddleware = t.middleware(async ({ path, ctx, next }) => {
  const start = Date.now();
  const viewerId = ctx.identity?.userId ?? null;

  let errorType: string | null = null;
  try {
    const result = await next();
    if (!result.ok) {
      errorType = result.error.code;
    }
    return result;
  } catch (err) {
    if (err instanceof TRPCError) {
      errorType = err.code;
    } else {
      errorType = "INTERNAL_SERVER_ERROR";
    }
    throw err;
  } finally {
    const latency = Date.now() - start;
    trpcLogger.info({
      span: path,
      viewerId,
      latency,
      errorType
    });
  }
});

export const publicProcedure = t.procedure.use(tracingMiddleware);
