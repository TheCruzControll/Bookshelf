import { TRPCError } from "@trpc/server";
import {
  AppServices,
  RequestDeleteInputSchema,
  RequestDeleteOutputSchema,
  CancelDeleteOutputSchema,
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
      const services = new AppServices(ctx.repositories, {
        getCurrentIdentity: async () => ctx.identity,
      });
      const deletion = await services.accountDeletion.requestDelete(ctx.identity.userId);
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
      const services = new AppServices(ctx.repositories, {
        getCurrentIdentity: async () => ctx.identity,
      });
      const cancelled = await services.accountDeletion.cancelDelete(ctx.identity.userId);
      return { cancelled };
    }),
});
