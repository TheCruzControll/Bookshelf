import { TRPCError } from "@trpc/server";
import {
  AppServices,
  FollowCreateInputSchema,
  FollowCreateOutputSchema,
  FollowDeleteInputSchema,
  FollowDeleteOutputSchema,
  FollowListInputSchema,
  FollowListOutputSchema,
} from "@hone/domain";
import { router, publicProcedure } from "./trpc";

export const followRouter = router({
  create: publicProcedure
    .input(FollowCreateInputSchema)
    .output(FollowCreateOutputSchema)
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
        const follow = await services.follows.createFollow({
          followerId: ctx.identity.userId,
          followeeId: input.followeeId,
        });
        return { follow };
      } catch (err) {
        if (err instanceof Error) {
          const code = (err as NodeJS.ErrnoException & { code?: string }).code;
          if (code === "FORBIDDEN") {
            throw new TRPCError({ code: "FORBIDDEN", message: err.message });
          }
          if (code === "BAD_REQUEST") {
            throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
          }
        }
        throw err;
      }
    }),

  delete: publicProcedure
    .input(FollowDeleteInputSchema)
    .output(FollowDeleteOutputSchema)
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
      await services.follows.deleteFollow({
        followerId: ctx.identity.userId,
        followeeId: input.followeeId,
      });
      return { success: true };
    }),

  list: publicProcedure
    .input(FollowListInputSchema)
    .output(FollowListOutputSchema)
    .query(async ({ input, ctx }) => {
      if (!ctx.repositories) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Repositories not configured" });
      }
      const viewerId = ctx.identity?.userId;
      const services = new AppServices(ctx.repositories, {
        getCurrentIdentity: async () => ctx.identity ?? null,
      });

      let follows;
      if (input.type === "followers") {
        follows = await services.follows.listFollowers(
          input.userId,
          viewerId ?? input.userId,
          input.limit,
        );
      } else {
        follows = await services.follows.listFollowing(
          input.userId,
          viewerId ?? input.userId,
          input.limit,
        );
      }

      // Simple cursor-based pagination: skip items up to cursor, take limit
      let startIdx = 0;
      if (input.cursor) {
        const cursorIdx = follows.findIndex((f) => f.id === input.cursor);
        if (cursorIdx >= 0) {
          startIdx = cursorIdx + 1;
        }
      }

      const page = follows.slice(startIdx, startIdx + input.limit);
      const nextCursor = page.length === input.limit && startIdx + input.limit < follows.length
        ? page[page.length - 1]!.id
        : null;

      return { follows: page, nextCursor };
    }),
});
