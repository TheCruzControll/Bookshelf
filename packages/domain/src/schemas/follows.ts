import { z } from "zod";
import { EntityIdSchema } from "./auth";
import { FollowSchema } from "./profiles";

export const FollowCreateInputSchema = z.object({
  followeeId: EntityIdSchema,
});

export const FollowCreateOutputSchema = z.object({
  follow: FollowSchema,
});

export const FollowDeleteInputSchema = z.object({
  followeeId: EntityIdSchema,
});

export const FollowDeleteOutputSchema = z.object({
  success: z.boolean(),
});

export const FollowListInputSchema = z.object({
  userId: EntityIdSchema,
  type: z.enum(["followers", "following"]),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

export const FollowListOutputSchema = z.object({
  follows: z.array(FollowSchema),
  nextCursor: z.string().nullable(),
});

export type FollowCreateInput = z.infer<typeof FollowCreateInputSchema>;
export type FollowCreateOutput = z.infer<typeof FollowCreateOutputSchema>;
export type FollowDeleteInput = z.infer<typeof FollowDeleteInputSchema>;
export type FollowDeleteOutput = z.infer<typeof FollowDeleteOutputSchema>;
export type FollowListInput = z.infer<typeof FollowListInputSchema>;
export type FollowListOutput = z.infer<typeof FollowListOutputSchema>;
