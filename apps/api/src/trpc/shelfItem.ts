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
import type { TrpcContext } from "./context";
import { router, publicProcedure } from "./trpc";

function makeServices(ctx: TrpcContext) {
  return new AppServices(ctx.repositories!, {
    getCurrentIdentity: async () => ctx.identity,
  });
}

function requireAuth(ctx: TrpcContext) {
  if (!ctx.repositories) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Repositories not configured" });
  }
  if (!ctx.identity) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
}

function mapServiceError(err: unknown): never {
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

export const shelfItemRouter = router({
  upsert: publicProcedure
    .input(UpsertShelfItemInputSchema)
    .output(UpsertShelfItemOutputSchema)
    .mutation(async ({ input, ctx }) => {
      requireAuth(ctx);
      const services = makeServices(ctx);
      try {
        const shelfItem = await services.shelves.upsertItem({
          ownerId: ctx.identity!.userId,
          shelfId: input.shelfId,
          bookId: input.bookId,
          editionId: input.editionId,
          status: input.status,
          notes: input.notes,
        });
        return { shelfItem };
      } catch (err) {
        mapServiceError(err);
      }
    }),

  move: publicProcedure
    .input(MoveShelfItemInputSchema)
    .output(MoveShelfItemOutputSchema)
    .mutation(async ({ input, ctx }) => {
      requireAuth(ctx);
      const services = makeServices(ctx);
      try {
        const shelfItem = await services.shelves.moveItem({
          ownerId: ctx.identity!.userId,
          shelfItemId: input.shelfItemId,
          position: input.position,
        });
        return { shelfItem };
      } catch (err) {
        mapServiceError(err);
      }
    }),

  delete: publicProcedure
    .input(DeleteShelfItemInputSchema)
    .output(DeleteShelfItemOutputSchema)
    .mutation(async ({ input, ctx }) => {
      requireAuth(ctx);
      const services = makeServices(ctx);
      try {
        await services.shelves.deleteItem({
          ownerId: ctx.identity!.userId,
          shelfItemId: input.shelfItemId,
        });
        return { success: true };
      } catch (err) {
        mapServiceError(err);
      }
    }),
});
