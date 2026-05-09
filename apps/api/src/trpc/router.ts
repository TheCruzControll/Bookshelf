import { initTRPC, TRPCError } from "@trpc/server";
import { ZodError } from "zod";
import { captureException } from "@hone/observability";
import type { TrpcContext } from "./context";

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
export const publicProcedure = t.procedure;

export const appRouter = router({});

export type AppRouter = typeof appRouter;
