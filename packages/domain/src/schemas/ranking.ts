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
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CreateReviewInputSchema = z.object({
  bookId: EntityIdSchema,
  editionId: EntityIdSchema.optional(),
  body: z.string().min(1),
  visibility: z.enum(["public", "followers", "mutuals", "private"]).default("public"),
});

export const UpdateReviewInputSchema = z.object({
  body: z.string().min(1).optional(),
  visibility: z.enum(["public", "followers", "mutuals", "private"]).optional(),
});

export type RankingInput = z.infer<typeof RankingSchema>;
export type ReviewInput = z.infer<typeof ReviewSchema>;
export type CreateReviewInput = z.infer<typeof CreateReviewInputSchema>;
export type UpdateReviewInput = z.infer<typeof UpdateReviewInputSchema>;
