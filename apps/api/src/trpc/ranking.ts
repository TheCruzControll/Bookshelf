import { TRPCError } from "@trpc/server";
import {
  AppServices,
  ReviewService,
  CompareInputSchema,
  CompareOutputSchema,
  StartBucketInputSchema,
  StartBucketOutputSchema,
  selectCandidate,
} from "@hone/domain";
import type { EntityId } from "@hone/domain";
import { router, publicProcedure } from "./trpc";

const COMPARE_STATE_TTL_MS = 30 * 60 * 1000;

interface ComparisonState {
  ownerId: EntityId;
  bookId: EntityId;
  bucket: number;
  rankedIds: EntityId[];
  lo: number;
  hi: number;
}

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

  compare: publicProcedure
    .input(CompareInputSchema)
    .output(CompareOutputSchema)
    .mutation(async ({ input, ctx }) => {
      if (!ctx.repositories) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Repositories not configured" });
      }
      if (!ctx.identity) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      const cacheKey = `compare:${input.rankingId}`;

      let state = await ctx.cache?.get<ComparisonState>(cacheKey) ?? null;

      if (!state) {
        const ranking = await ctx.repositories.rankings.findById(input.rankingId);
        if (!ranking || ranking.profileId !== ctx.identity.userId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Ranking session not found" });
        }

        const allRankings = await ctx.repositories.rankings.listByOwner(ctx.identity.userId);

        const sorted = allRankings
          .filter((r) => r.bookId !== ranking.bookId)
          .sort((a, b) => a.position - b.position);

        state = {
          ownerId: ctx.identity.userId,
          bookId: ranking.bookId,
          bucket: ranking.bucket,
          rankedIds: sorted.map((r) => r.bookId),
          lo: 0,
          hi: sorted.length,
        };
      } else {
        if (state.ownerId !== ctx.identity.userId) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }

        if (input.winner !== undefined) {
          const mid = Math.floor((state.lo + state.hi) / 2);
          if (input.winner === "new") {
            state = { ...state, lo: mid + 1 };
          } else {
            state = { ...state, hi: mid };
          }
        }
      }

      if (state.lo >= state.hi) {
        await ctx.cache?.del(cacheKey);
        let reviewId: string | undefined;
        if (input.reviewBody) {
          const reviewService = new ReviewService(ctx.repositories.reviews, ctx.repositories.activity);
          const review = await reviewService.createReview({
            authorId: ctx.identity.userId,
            bookId: state.bookId,
            body: input.reviewBody,
            visibility: input.reviewVisibility ?? "public",
          });
          reviewId = review.id;
        }
        return { done: true as const, position: state.lo, reviewId };
      }

      const mid = Math.floor((state.lo + state.hi) / 2);

      const rankedCandidates = state.rankedIds.slice(state.lo, state.hi).map((id, idx) => ({
        bookId: id,
        position: state!.lo + idx,
        score: 5,
        bucket: state!.bucket,
        genres: [] as string[],
      }));

      const candidate = selectCandidate({
        rankedBooks: rankedCandidates,
        targetBucket: state.bucket,
        midpoint: mid,
        newBookGenres: [],
      });

      const candidateBookId = candidate?.bookId ?? state.rankedIds[mid];

      await ctx.cache?.set(cacheKey, state, COMPARE_STATE_TTL_MS);

      return {
        done: false as const,
        candidateBookId: candidateBookId as EntityId,
        newBookId: state.bookId,
      };
    }),
});
