import { TRPCError } from "@trpc/server";
import {
  AppServices,
  CreateShelfInputSchema,
  CreateShelfOutputSchema,
  UpdateShelfInputSchema,
  UpdateShelfOutputSchema,
  DeleteShelfInputSchema,
  DeleteShelfOutputSchema,
  ListShelvesInputSchema,
  ListShelvesOutputSchema,
} from "@hone/domain";
import { router, publicProcedure } from "./trpc";

export const shelfRouter = router({
  create: publicProcedure
    .input(CreateShelfInputSchema)
    .output(CreateShelfOutputSchema)
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
      const shelf = await services.shelves.createShelf({
        ownerId: ctx.identity.userId,
        name: input.name,
        visibility: input.visibility,
      });
      return { shelf };
    }),

  update: publicProcedure
    .input(UpdateShelfInputSchema)
    .output(UpdateShelfOutputSchema)
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
        const shelf = await services.shelves.updateShelf({
          id: input.id,
          ownerId: ctx.identity.userId,
          name: input.name,
          visibility: input.visibility,
          description: input.description,
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
        }
        throw err;
      }
    }),

  delete: publicProcedure
    .input(DeleteShelfInputSchema)
    .output(DeleteShelfOutputSchema)
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
        await services.shelves.deleteShelf({
          id: input.id,
          ownerId: ctx.identity.userId,
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

  list: publicProcedure
    .input(ListShelvesInputSchema)
    .output(ListShelvesOutputSchema)
    .query(async ({ input, ctx }) => {
      if (!ctx.repositories) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Repositories not configured" });
      }
      const viewerId = ctx.identity?.userId;
      const services = new AppServices(ctx.repositories, {
        getCurrentIdentity: async () => ctx.identity ?? null,
      });
      const shelves = await services.shelves.listShelves(input.ownerId, viewerId);
      return { shelves };
    }),
});
