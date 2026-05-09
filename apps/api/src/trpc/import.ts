import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  AppServices,
  CreateImportOutputSchema,
  EntityIdSchema,
  ImportSourceSchema,
  ImportSchema,
  ListImportsOutputSchema,
  TransitionImportStatusInputSchema,
} from "@hone/domain";
import { router, publicProcedure } from "./trpc";

export const importRouter = router({
  create: publicProcedure
    .input(
      z.object({
        id: EntityIdSchema,
        source: ImportSourceSchema,
        fileContent: z.string(),
      })
    )
    .output(CreateImportOutputSchema)
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
      return services.imports.createImport({
        id: input.id,
        ownerId: ctx.identity.userId,
        source: input.source,
        fileContent: input.fileContent,
      });
    }),

  transitionStatus: publicProcedure
    .input(TransitionImportStatusInputSchema)
    .output(ImportSchema)
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
        return await services.imports.transitionStatus({
          id: input.id,
          toStatus: input.toStatus,
        });
      } catch (err) {
        if (err instanceof Error) {
          const code = (err as NodeJS.ErrnoException & { code?: string }).code;
          if (code === "IMPORT_NOT_FOUND") {
            throw new TRPCError({ code: "NOT_FOUND", message: err.message });
          }
          if (code === "INVALID_STATUS_TRANSITION") {
            throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
          }
        }
        throw err;
      }
    }),

  getById: publicProcedure
    .input(z.object({ id: EntityIdSchema }))
    .output(ImportSchema.nullable())
    .query(async ({ input, ctx }) => {
      if (!ctx.repositories) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Repositories not configured" });
      }
      if (!ctx.identity) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }
      const services = new AppServices(ctx.repositories, {
        getCurrentIdentity: async () => ctx.identity,
      });
      return services.imports.findById(input.id);
    }),

  listMine: publicProcedure
    .output(ListImportsOutputSchema)
    .query(async ({ ctx }) => {
      if (!ctx.repositories) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Repositories not configured" });
      }
      if (!ctx.identity) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }
      const services = new AppServices(ctx.repositories, {
        getCurrentIdentity: async () => ctx.identity,
      });
      return services.imports.listByOwner(ctx.identity.userId);
    }),
});
