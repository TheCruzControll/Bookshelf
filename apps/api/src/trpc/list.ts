import { TRPCError } from "@trpc/server";
import {
  AppServices,
  PublishShelfInputSchema,
  PublishShelfOutputSchema,
  UnpublishShelfInputSchema,
  UnpublishShelfOutputSchema,
} from "@hone/domain";
import { router, publicProcedure } from "./trpc";

export const listRouter = router({
  publish: publicProcedure
    .input(PublishShelfInputSchema)
    .output(PublishShelfOutputSchema)
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
        const shelf = await services.shelves.publishShelf({
          id: input.id,
          ownerId: ctx.identity.userId,
          version: input.version,
        });
        return { shelf };
      } catch (err) {
        if (err instanceof Error) {
          const code = (err as NodeJS.ErrnoException & { code?: string }).code;
          if (code === "NOT_FOUND") {
            throw new TRPCError({ code: "NOT_FOUND", message: err.message });
          }
          if (code === "FORBIDDEN") {
            throw new TRPCError({ code: "FORBIDDEN", message: err.message });
          }
          if (code === "BAD_REQUEST") {
            throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
          }
        }
        throw err;
      }
    }),

  unpublish: publicProcedure
    .input(UnpublishShelfInputSchema)
    .output(UnpublishShelfOutputSchema)
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
        const shelf = await services.shelves.unpublishShelf({
          id: input.id,
          ownerId: ctx.identity.userId,
          version: input.version,
        });
        return { shelf };
      } catch (err) {
        if (err instanceof Error) {
          const code = (err as NodeJS.ErrnoException & { code?: string }).code;
          if (code === "NOT_FOUND") {
            throw new TRPCError({ code: "NOT_FOUND", message: err.message });
          }
          if (code === "FORBIDDEN") {
            throw new TRPCError({ code: "FORBIDDEN", message: err.message });
          }
          if (code === "BAD_REQUEST") {
            throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
          }
        }
        throw err;
      }
    }),
});
