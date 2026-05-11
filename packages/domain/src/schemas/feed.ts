import { z } from "zod";
import { EntityIdSchema } from "./auth";
import { ProfileSchema } from "./profiles";
import { BookSchema, ShelfSchema } from "./shelves";
import { ReviewSchema } from "./ranking";

export const ActivityVerbSchema = z.enum([
  "book_added",
  "book_started",
  "book_finished",
  "book_dropped",
  "book_ranked",
  "book_reviewed",
  "shelf_updated",
]);

export const ActivityEventSchema = z.object({
  id: EntityIdSchema,
  actorId: EntityIdSchema,
  verb: ActivityVerbSchema,
  bookId: EntityIdSchema.optional(),
  shelfId: EntityIdSchema.optional(),
  reviewId: EntityIdSchema.optional(),
  visibility: z.enum(["public", "followers", "mutuals", "private"]),
  occurredAt: z.date(),
  scoreAtPublish: z.number().optional(),
  scoreLockedAtPublish: z.boolean().optional(),
  groupKey: z.string().optional(),
});

export const FeedItemSchema = z.object({
  event: ActivityEventSchema,
  actor: ProfileSchema,
  book: BookSchema.optional(),
  shelf: ShelfSchema.optional(),
  review: ReviewSchema.optional(),
});

export const FeedCursorSchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().positive().max(50).default(20),
});

export type ActivityVerbInput = z.infer<typeof ActivityVerbSchema>;
export type ActivityEventInput = z.infer<typeof ActivityEventSchema>;
export type FeedItemInput = z.infer<typeof FeedItemSchema>;
export type FeedCursorInput = z.infer<typeof FeedCursorSchema>;
