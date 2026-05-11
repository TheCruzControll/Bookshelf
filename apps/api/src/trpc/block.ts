import { TRPCError } from "@trpc/server";
import {
  AppServices,
  BlockCreateInputSchema,
  BlockCreateOutputSchema,
  BlockDeleteInputSchema,
  BlockDeleteOutputSchema,
} from "@hone/domain";
import { router, publicProcedure } from "./trpc";

export const blockRouter = router({
  create: publicProcedure
    .input(BlockCreateInputSchema)
    .output(BlockCreateOutputSchema)
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
        const block = await services.blocks.createBlock({
          blockerId: ctx.identity.userId,
          blockedId: input.blockedId,
        });

        // Invalidate mutual count cache for both users
        await Promise.all([
          ctx.cache?.del(`mutual-count:${ctx.identity.userId}`),
          ctx.cache?.del(`mutual-count:${input.blockedId}`),
        ]);

        return { block };
      } catch (err) {
        if (err instanceof Error) {
          const code = (err as NodeJS.ErrnoException & { code?: string }).code;
          if (code === "BAD_REQUEST") {
            throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
          }
        }
        throw err;
      }
    }),

  delete: publicProcedure
    .input(BlockDeleteInputSchema)
    .output(BlockDeleteOutputSchema)
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
      await services.blocks.deleteBlock({
        blockerId: ctx.identity.userId,
        blockedId: input.blockedId,
      });

      return { success: true };
    }),
});
