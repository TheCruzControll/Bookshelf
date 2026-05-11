import { TRPCError } from "@trpc/server";
import {
  AppServices,
  UpsertShelfItemInputSchema,
  UpsertShelfItemOutputSchema,
  MoveShelfItemInputSchema,
  MoveShelfItemOutputSchema,
  DeleteShelfItemInputSchema,
  DeleteShelfItemOutputSchema,
} from "@hone/domain";
import { router, publicProcedure } from "./trpc";

export const shelfItemRouter = router({
  upsert: publicProcedure
    .input(UpsertShelfItemInputSchema)
    .output(UpsertShelfItemOutputSchema)
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
        const shelfItem = await services.shelves.upsertShelfItem({
          ownerId: ctx.identity.userId,
          shelfId: input.shelfId,
          bookId: input.bookId,
          editionId: input.editionId,
          notes: input.notes,
          position: input.position,
        });
        return { shelfItem };
      } catch (err) {
        if (err instanceof Error) {
          const code = (err as NodeJS.ErrnoException & { code?: string }).code;
          if (code === "NOT_FOUND") {
            throw new TRPCError({ code: "NOT_FOUND", message: err.message });
          }
          if (code === "FORBIDDEN") {
            throw new TRPCError({ code: "FORBIDDEN", message: err.message });
          }
        }
        throw err;
      }
    }),

  move: publicProcedure
    .input(MoveShelfItemInputSchema)
    .output(MoveShelfItemOutputSchema)
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
        const shelfItem = await services.shelves.moveShelfItem({
          ownerId: ctx.identity.userId,
          shelfId: input.shelfId,
          bookId: input.bookId,
          position: input.position,
        });
        return { shelfItem };
      } catch (err) {
        if (err instanceof Error) {
          const code = (err as NodeJS.ErrnoException & { code?: string }).code;
          if (code === "NOT_FOUND") {
            throw new TRPCError({ code: "NOT_FOUND", message: err.message });
          }
          if (code === "FORBIDDEN") {
            throw new TRPCError({ code: "FORBIDDEN", message: err.message });
          }
        }
        throw err;
      }
    }),

  delete: publicProcedure
    .input(DeleteShelfItemInputSchema)
    .output(DeleteShelfItemOutputSchema)
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
        await services.shelves.deleteShelfItem({
          ownerId: ctx.identity.userId,
          shelfId: input.shelfId,
          bookId: input.bookId,
        });
        return { success: true };
      } catch (err) {
        if (err instanceof Error) {
          const code = (err as NodeJS.ErrnoException & { code?: string }).code;
          if (code === "NOT_FOUND") {
            throw new TRPCError({ code: "NOT_FOUND", message: err.message });
          }
          if (code === "FORBIDDEN") {
            throw new TRPCError({ code: "FORBIDDEN", message: err.message });
          }
        }
        throw err;
      }
    }),
});
