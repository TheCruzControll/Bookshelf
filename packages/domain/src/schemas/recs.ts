import { z } from "zod";
import { EntityIdSchema } from "./auth";
import { BookSchema } from "./shelves";

export const RecommendationSchema = z.object({
  book: BookSchema,
  score: z.number().min(0).max(10),
  reason: z.string().min(1),
});

export const RecsQuerySchema = z.object({
  limit: z.number().int().positive().max(50).default(20),
  cursor: z.string().optional(),
});

/**
 * Recommendation surface — where the rec list is rendered. Per PRD Q15
 * there are two v1 surfaces: the Discover tab and the Book Detail
 * "you might also like" rail.
 */
export const RecSurfaceSchema = z.enum(["discover", "book_detail"]);

/**
 * tRPC input/output for `recommendations.forDiscover` (P-06, #142).
 *
 * Surface: the Discover tab. Returns up to `limit` recommendations for
 * the viewer; the server enforces a max of 50 and defaults to 20.
 */
export const RecsForDiscoverInputSchema = z.object({
  limit: z.number().int().positive().max(50).default(20),
});

/**
 * tRPC input/output for `recommendations.forBookDetail` (P-06, #142).
 *
 * Surface: the Book Detail "you might also like" rail. Returns a small
 * carousel of related recs (default 8, max 20). `bookId` is included so
 * the server can scope per-book recs in the future; the v1 implementation
 * shares the viewer's discover-surface list.
 */
export const RecsForBookDetailInputSchema = z.object({
  bookId: EntityIdSchema,
  limit: z.number().int().positive().max(20).default(8),
});

export const RecsListOutputSchema = z.object({
  recommendations: z.array(RecommendationSchema),
});

export type RecommendationInput = z.infer<typeof RecommendationSchema>;
export type RecsQueryInput = z.infer<typeof RecsQuerySchema>;
export type RecSurface = z.infer<typeof RecSurfaceSchema>;
export type RecsForDiscoverInput = z.infer<typeof RecsForDiscoverInputSchema>;
export type RecsForBookDetailInput = z.infer<typeof RecsForBookDetailInputSchema>;
export type RecsListOutput = z.infer<typeof RecsListOutputSchema>;
