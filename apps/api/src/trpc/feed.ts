import { TRPCError } from "@trpc/server";
import {
  AppServices,
  FeedListInputSchema,
  FeedListOutputSchema,
} from "@hone/domain";
import { router, publicProcedure } from "./trpc";

export const feedRouter = router({
  list: publicProcedure
    .input(FeedListInputSchema)
    .output(FeedListOutputSchema)
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

      const feedInput: { viewerId: string; cursor?: string; groupLimit: number } = {
        viewerId: ctx.identity.userId,
        groupLimit: input.limit,
      };
      if (input.cursor) {
        feedInput.cursor = input.cursor;
      }
      const result = await services.social.getFriendFeedGrouped(feedInput);

      return {
        groups: result.groups,
        nextCursor: result.nextCursor,
      };
    }),
});
