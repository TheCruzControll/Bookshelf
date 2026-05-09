import { TRPCError } from "@trpc/server";
import {
  AppServices,
  CreateReviewInputSchema,
  CreateReviewOutputSchema,
} from "@hone/domain";
import { router, publicProcedure } from "./trpc";

export const reviewRouter = router({
  create: publicProcedure
    .input(CreateReviewInputSchema)
    .output(CreateReviewOutputSchema)
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
      const review = await services.reviews.createReview({
        authorId: ctx.identity.userId,
        bookId: input.bookId,
        editionId: input.editionId,
        body: input.body,
        visibility: input.visibility,
      });
      return { review };
    }),
});
