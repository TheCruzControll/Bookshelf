import { TRPCError } from "@trpc/server";
import {
  AppServices,
  RankingService,
  ReviewService,
  CompareInputSchema,
  CompareOutputSchema,
  StartBucketInputSchema,
  StartBucketOutputSchema,
  RerankInputSchema,
  RerankOutputSchema,
  VersionConflictError,
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
  isRerank?: boolean;
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
        const isRerank = state.isRerank === true;
        await ctx.cache?.del(cacheKey);

        // When this is a rerank, finalize: update ranking row and publish
        // a new book_ranked activity event.  Old events retain frozen scores.
        if (isRerank) {
          const allRankings = await ctx.repositories.rankings.listByOwner(ctx.identity.userId);
          const total = allRankings.filter((r) => r.bookId !== state.bookId).length + 1;
          const rankingService = new RankingService(ctx.repositories.rankings, ctx.repositories.activity);
          await rankingService.finishRerank({
            ownerId: ctx.identity.userId,
            bookId: state.bookId,
            position: state.lo,
            total,
          });
        }

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

  rerank: publicProcedure
    .input(RerankInputSchema)
    .output(RerankOutputSchema)
    .mutation(async ({ input, ctx }) => {
      if (!ctx.repositories) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Repositories not configured" });
      }
      if (!ctx.identity) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      const rankingService = new RankingService(ctx.repositories.rankings, ctx.repositories.activity);

      try {
        const ranking = await rankingService.rerank({
          ownerId: ctx.identity.userId,
          bookId: input.bookId,
          version: input.version,
          bucket: input.bucket,
        });

        // Pre-seed the comparison state with isRerank=true so the compare
        // flow knows to publish a book_ranked event on completion.
        const allRankings = await ctx.repositories.rankings.listByOwner(ctx.identity.userId);
        const sorted = allRankings
          .filter((r) => r.bookId !== input.bookId)
          .sort((a, b) => a.position - b.position);

        const state: ComparisonState = {
          ownerId: ctx.identity.userId,
          bookId: input.bookId,
          bucket: input.bucket,
          rankedIds: sorted.map((r) => r.bookId),
          lo: 0,
          hi: sorted.length,
          isRerank: true,
        };

        const cacheKey = `compare:${ranking.id}`;
        await ctx.cache?.set(cacheKey, state, COMPARE_STATE_TTL_MS);

        return {
          rankingId: ranking.id,
          bookId: ranking.bookId,
          bucket: ranking.bucket,
        };
      } catch (err: unknown) {
        const error = err as Error & {
          code?: string;
          currentVersion?: number;
          currentValue?: unknown;
        };
        if (error.code === "NOT_FOUND") {
          throw new TRPCError({ code: "NOT_FOUND", message: error.message });
        }
        if (error.code === "VERSION_CONFLICT") {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Version conflict: expected ${input.version}, current is ${error.currentVersion}`,
            cause: new VersionConflictError({
              resource: "ranking",
              currentVersion: error.currentVersion ?? 0,
              currentValue: error.currentValue ?? null,
            }),
          });
        }
        throw err;
      }
    }),
});
