import { TRPCError } from "@trpc/server";
import {
  AppServices,
  CreateReviewInputSchema,
  CreateReviewOutputSchema,
  UpdateReviewInputSchema,
  UpdateReviewOutputSchema,
  DeleteReviewInputSchema,
  DeleteReviewOutputSchema,
  VersionConflictError,
} from "@hone/domain";
import { router, publicProcedure } from "./trpc";

export const reviewRouter = router({
  create: publicProcedure
    .input(CreateReviewInputSchema)
    .output(CreateReviewOutputSchema)
    .mutation(async ({ input, ctx }) => {
      if (!ctx.repositories) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Repositories not configured" });
      }
      if (!ctx.identity) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }
      const services = new AppServices(ctx.repositories, {
        getCurrentIdentity: async () => ctx.identity,
      });
      const review = await services.reviews.createReview({
        authorId: ctx.identity.userId,
        bookId: input.bookId,
        editionId: input.editionId,
        body: input.body,
        visibility: input.visibility,
      });
      return { review };
    }),

  update: publicProcedure
    .input(UpdateReviewInputSchema)
    .output(UpdateReviewOutputSchema)
    .mutation(async ({ input, ctx }) => {
      if (!ctx.repositories) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Repositories not configured" });
      }
      if (!ctx.identity) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }
      const services = new AppServices(ctx.repositories, {
        getCurrentIdentity: async () => ctx.identity,
      });
      try {
        const review = await services.reviews.updateReview({
          id: input.id,
          authorId: ctx.identity.userId,
          version: input.version,
          body: input.body,
          visibility: input.visibility,
        });
        return { review };
      } catch (err) {
        if (err instanceof Error) {
          const errWithCode = err as Error & { code?: string; currentReview?: unknown };
          if (errWithCode.code === "NOT_FOUND") {
            throw new TRPCError({ code: "NOT_FOUND", message: err.message });
          }
          if (errWithCode.code === "FORBIDDEN") {
            throw new TRPCError({ code: "FORBIDDEN", message: err.message });
          }
          if (errWithCode.code === "VERSION_CONFLICT") {
            // Wrap so the error formatter can surface a typed conflict
            // payload (data.conflict) for the client error mapper.
            throw new TRPCError({
              code: "CONFLICT",
              message: "Version conflict",
              cause: new VersionConflictError({
                resource: "review",
                currentVersion:
                  (errWithCode.currentReview as { version?: number } | undefined)?.version ?? 0,
                currentValue: errWithCode.currentReview,
              }),
            });
          }
        }
        throw err;
      }
    }),

  delete: publicProcedure
    .input(DeleteReviewInputSchema)
    .output(DeleteReviewOutputSchema)
    .mutation(async ({ input, ctx }) => {
      if (!ctx.repositories) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Repositories not configured" });
      }
      if (!ctx.identity) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }
      const services = new AppServices(ctx.repositories, {
        getCurrentIdentity: async () => ctx.identity,
      });
      try {
        await services.reviews.deleteReview({
          id: input.id,
          authorId: ctx.identity.userId,
        });
        return { success: true as const };
      } catch (err) {
        if (err instanceof Error) {
          const errWithCode = err as Error & { code?: string };
          if (errWithCode.code === "NOT_FOUND") {
            throw new TRPCError({ code: "NOT_FOUND", message: err.message });
          }
          if (errWithCode.code === "FORBIDDEN") {
            throw new TRPCError({ code: "FORBIDDEN", message: err.message });
          }
        }
        throw err;
      }
    }),
});
