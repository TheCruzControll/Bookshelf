import { initTRPC, TRPCError } from "@trpc/server";
import { ZodError } from "zod";
import { captureException, createLogger } from "@hone/observability";
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
