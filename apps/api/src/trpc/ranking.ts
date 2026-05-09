import { TRPCError } from "@trpc/server";
import {
  AppServices,
  StartBucketInputSchema,
  StartBucketOutputSchema,
} from "@hone/domain";
import { router, publicProcedure } from "./trpc";

export const rankingRouter = router({
  startBucket: publicProcedure
    .input(StartBucketInputSchema)
    .output(StartBucketOutputSchema)
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
      const ranking = await services.rankings.startBucket({
        ownerId: ctx.identity.userId,
        bookId: input.bookId,
        bucket: input.bucket,
      });
      return {
        rankingId: ranking.id,
        bookId: ranking.bookId,
        bucket: ranking.bucket,
      };
    }),
});
