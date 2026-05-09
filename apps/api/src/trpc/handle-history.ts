import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, publicProcedure } from "./trpc";

export const handleHistoryRouter = router({
  resolve: publicProcedure
    .input(z.object({ handle: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      if (!ctx.repositories) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Repositories not configured" });
      }
      const entry = await ctx.repositories.handleHistory.findByOldHandle(input.handle.toLowerCase());
      if (!entry) {
        return { currentHandle: null };
      }
      const profile = await ctx.repositories.profiles.findById(entry.profileId);
      if (!profile) {
        return { currentHandle: null };
      }
      return { currentHandle: profile.handle };
    }),
});
