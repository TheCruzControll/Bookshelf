import { z } from "zod";
import { EntityIdSchema } from "./auth";

export const RankingSchema = z.object({
  id: EntityIdSchema,
  ownerId: EntityIdSchema,
  bookId: EntityIdSchema,
  rank: z.number().int().positive(),
  score: z.number().min(0).max(10),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const ReviewSchema = z.object({
  id: EntityIdSchema,
  authorId: EntityIdSchema,
  bookId: EntityIdSchema,
  editionId: EntityIdSchema.optional(),
  body: z.string().min(1),
  visibility: z.enum(["public", "followers", "mutuals", "private"]),
  version: z.number().int().positive(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CreateReviewInputSchema = z.object({
  bookId: EntityIdSchema,
  editionId: EntityIdSchema.optional(),
  body: z.string().min(1),
  visibility: z.enum(["public", "followers", "mutuals", "private"]).default("public"),
});

export const CreateReviewOutputSchema = z.object({
  review: ReviewSchema,
});

export const UpdateReviewInputSchema = z.object({
  id: EntityIdSchema,
  version: z.number().int().positive(),
  body: z.string().min(1).optional(),
  visibility: z.enum(["public", "followers", "mutuals", "private"]).optional(),
});

export const UpdateReviewOutputSchema = z.object({
  review: ReviewSchema,
});

export const DeleteReviewInputSchema = z.object({
  id: EntityIdSchema,
});

export const DeleteReviewOutputSchema = z.object({
  success: z.literal(true),
});

export const StartBucketInputSchema = z.object({
  bookId: EntityIdSchema,
  bucket: z.number().int().min(1).max(5),
});

export const StartBucketOutputSchema = z.object({
  rankingId: EntityIdSchema,
  bookId: EntityIdSchema,
  bucket: z.number().int().min(1).max(5),
});

export const CompareInputSchema = z.object({
  rankingId: EntityIdSchema,
  winner: z.enum(["new", "existing"]).optional(),
  reviewBody: z.string().min(1).optional(),
  reviewVisibility: z.enum(["public", "followers", "mutuals", "private"]).optional(),
});

export const CompareOutputSchema = z.discriminatedUnion("done", [
  z.object({
    done: z.literal(false),
    candidateBookId: EntityIdSchema,
    newBookId: EntityIdSchema,
  }),
  z.object({
    done: z.literal(true),
    position: z.number().int().nonnegative(),
    reviewId: EntityIdSchema.optional(),
  }),
]);

export type RankingInput = z.infer<typeof RankingSchema>;
export type ReviewInput = z.infer<typeof ReviewSchema>;
export type CreateReviewInput = z.infer<typeof CreateReviewInputSchema>;
export type CreateReviewOutput = z.infer<typeof CreateReviewOutputSchema>;
export type UpdateReviewInput = z.infer<typeof UpdateReviewInputSchema>;
export type UpdateReviewOutput = z.infer<typeof UpdateReviewOutputSchema>;
export type DeleteReviewInput = z.infer<typeof DeleteReviewInputSchema>;
export type DeleteReviewOutput = z.infer<typeof DeleteReviewOutputSchema>;
export type StartBucketInput = z.infer<typeof StartBucketInputSchema>;
export type StartBucketOutput = z.infer<typeof StartBucketOutputSchema>;
export type CompareInput = z.infer<typeof CompareInputSchema>;
export type CompareOutput = z.infer<typeof CompareOutputSchema>;
