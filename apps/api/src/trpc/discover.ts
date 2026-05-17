import { TRPCError } from "@trpc/server";
import {
  AppServices,
  PeopleYouMayKnowInputSchema,
  PeopleYouMayKnowOutputSchema,
} from "@hone/domain";
import { router, publicProcedure } from "./trpc";

export const discoverRouter = router({
  /**
   * People-You-May-Know surface for the Discover tab (#144, P-08).
   *
   * Returns up to `limit` suggested profiles for the authenticated viewer,
   * combining contacts-match (#96) and friend-of-friend (FoF) sources.
   * Mutuals, blocked users (both directions), the viewer themselves, and
   * soft-deleted profiles are filtered out. Each suggestion is tagged with
   * its source (`"contacts" | "fof" | "both"`).
   *
   * Per Q4 lock this surface is purely passive — no push notifications, no
   * email. The query is the only externally-visible side-effect.
   */
  peopleYouMayKnow: publicProcedure
    .input(PeopleYouMayKnowInputSchema)
    .output(PeopleYouMayKnowOutputSchema)
    .query(async ({ input, ctx }) => {
      if (!ctx.repositories) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Repositories not configured",
        });
      }
      if (!ctx.identity) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }
      const identity = ctx.identity;
      const services = new AppServices(ctx.repositories, {
        getCurrentIdentity: async () => identity,
      });
      const suggestions = await services.social.getPeopleYouMayKnow({
        viewerId: identity.userId,
        limit: input.limit,
      });
      return { suggestions };
    }),
});
