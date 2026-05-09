import { z } from "zod";
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

export type RecommendationInput = z.infer<typeof RecommendationSchema>;
export type RecsQueryInput = z.infer<typeof RecsQuerySchema>;
