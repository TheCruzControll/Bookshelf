import { TRPCError } from "@trpc/server";
import {
  AppServices,
  CheckHandleInputSchema,
  CheckHandleOutputSchema,
  SetHandleInputSchema,
  SetHandleOutputSchema,
} from "@hone/domain";
import { router, publicProcedure } from "./trpc";

export const profileRouter = router({
  checkHandle: publicProcedure
    .input(CheckHandleInputSchema)
    .output(CheckHandleOutputSchema)
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
      return services.handles.checkHandle(input.handle);
    }),

  setHandle: publicProcedure
    .input(SetHandleInputSchema)
    .output(SetHandleOutputSchema)
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
        const profile = await services.handles.setHandle(ctx.identity.userId, input.handle);
        return { profile };
      } catch (err) {
        if (err instanceof Error && (err as NodeJS.ErrnoException & { code?: string }).code === "HANDLE_TAKEN") {
          throw new TRPCError({
            code: "CONFLICT",
            message: err.message,
          });
        }
        throw err;
      }
    }),
});
