import { TRPCError } from "@trpc/server";
import {
  AccountExportService,
  RequestDeleteInputSchema,
  RequestDeleteOutputSchema,
  CancelDeleteOutputSchema,
  RequestExportInputSchema,
  RequestExportOutputSchema,
  AccountDeletionService,
} from "@hone/domain";
import { router, publicProcedure } from "./trpc";

export const accountRouter = router({
  requestDelete: publicProcedure
    .input(RequestDeleteInputSchema)
    .output(RequestDeleteOutputSchema)
    .mutation(async ({ ctx }) => {
      if (!ctx.repositories) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Repositories not configured" });
      }
      if (!ctx.identity) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }
      const service = new AccountDeletionService(
        ctx.repositories.accountDeletions,
        ctx.repositories.sessions,
      );
      const deletion = await service.requestDelete(ctx.identity.userId);
      return { deletion };
    }),

  cancelDelete: publicProcedure
    .output(CancelDeleteOutputSchema)
    .mutation(async ({ ctx }) => {
      if (!ctx.repositories) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Repositories not configured" });
      }
      if (!ctx.identity) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }
      const service = new AccountDeletionService(
        ctx.repositories.accountDeletions,
        ctx.repositories.sessions,
      );
      const cancelled = await service.cancelDelete(ctx.identity.userId);
      return { cancelled };
    }),

  /**
   * GDPR data export (#153). Authenticated viewer only. Builds a
   * gzipped JSON archive of every user-scoped row owned by the
   * caller and returns a signed URL pointing at the blob; the URL
   * expires after {@link ACCOUNT_EXPORT_URL_TTL_MS} (24h default).
   *
   * Requires a {@link StorageProvider} to be wired into the tRPC
   * context; without one the procedure returns 501 because no
   * downloadable URL can be produced.
   */
  requestExport: publicProcedure
    .input(RequestExportInputSchema)
    .output(RequestExportOutputSchema)
    .mutation(async ({ ctx }) => {
      if (!ctx.repositories) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Repositories not configured" });
      }
      if (!ctx.identity) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }
      if (!ctx.storage) {
        throw new TRPCError({
          code: "NOT_IMPLEMENTED",
          message: "Object storage is not configured on this deployment",
        });
      }
      const service = new AccountExportService(ctx.repositories, ctx.storage);
      const { url, expiresAt } = await service.buildExport(ctx.identity.userId);
      return { url, expiresAt };
    }),
});
