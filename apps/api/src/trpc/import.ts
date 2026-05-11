import { TRPCError } from "@trpc/server";
import {
  AppServices,
  CheckImportInputSchema,
  CheckImportOutputSchema,
  ConfirmReuploadInputSchema,
  ConfirmReuploadOutputSchema,
} from "@hone/domain";
import { router, publicProcedure } from "./trpc";

export const importRouter = router({
  checkDuplicate: publicProcedure
    .input(CheckImportInputSchema)
    .output(CheckImportOutputSchema)
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
      return services.imports.checkForDuplicate({
        ownerId: ctx.identity.userId,
        fileHash: input.fileHash,
      });
    }),

  confirmReupload: publicProcedure
    .input(ConfirmReuploadInputSchema)
    .output(ConfirmReuploadOutputSchema)
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
      return services.imports.confirmReupload({
        ownerId: ctx.identity.userId,
        fileHash: input.fileHash,
        strategy: input.strategy,
      });
    }),
});
