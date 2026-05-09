import { z } from "zod";
import { EntityIdSchema } from "./auth";

export const VisibilitySchema = z.enum(["public", "followers", "mutuals", "private"]);

export const ContentTypeSchema = z.enum([
  "identity",
  "follower_list",
  "review",
  "score",
  "finished_shelf",
  "custom_shelf",
  "want_to_read_shelf",
  "reading_shelf",
  "dropped_shelf",
  "reading_status",
  "activity_stream",
]);

export const DefaultVisibilitySchema = z.object({
  identity: VisibilitySchema,
  follower_list: VisibilitySchema,
  review: VisibilitySchema,
  score: VisibilitySchema,
  finished_shelf: VisibilitySchema,
  custom_shelf: VisibilitySchema,
  want_to_read_shelf: VisibilitySchema,
  reading_shelf: VisibilitySchema,
  dropped_shelf: VisibilitySchema,
  reading_status: VisibilitySchema,
  activity_stream: VisibilitySchema,
});

export const POSTURE_C_DEFAULTS = {
  identity: "public",
  follower_list: "public",
  review: "public",
  score: "public",
  finished_shelf: "public",
  custom_shelf: "public",
  want_to_read_shelf: "followers",
  reading_shelf: "followers",
  dropped_shelf: "followers",
  reading_status: "followers",
  activity_stream: "followers",
} as const satisfies z.infer<typeof DefaultVisibilitySchema>;

export const ProfileSchema = z.object({
  id: EntityIdSchema,
  handle: z.string().min(1).max(30),
  displayName: z.string().min(1).max(100),
  bio: z.string().max(500).optional(),
  avatarUrl: z.string().url().optional(),
  defaultVisibility: DefaultVisibilitySchema,
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CreateProfileInputSchema = z.object({
  handle: z.string().min(1).max(30),
  displayName: z.string().min(1).max(100),
  bio: z.string().max(500).optional(),
  avatarUrl: z.string().url().optional(),
  defaultVisibility: DefaultVisibilitySchema.default(POSTURE_C_DEFAULTS),
});

export const UpdateProfileInputSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  bio: z.string().max(500).optional(),
  avatarUrl: z.string().url().optional(),
  defaultVisibility: DefaultVisibilitySchema.optional(),
});

export const FollowSchema = z.object({
  id: EntityIdSchema,
  followerId: EntityIdSchema,
  followeeId: EntityIdSchema,
  createdAt: z.date(),
});

export const BlockSchema = z.object({
  id: EntityIdSchema,
  blockerId: EntityIdSchema,
  blockedId: EntityIdSchema,
  createdAt: z.date(),
});

export type VisibilityInput = z.infer<typeof VisibilitySchema>;
export type ContentTypeInput = z.infer<typeof ContentTypeSchema>;
export type DefaultVisibilityInput = z.infer<typeof DefaultVisibilitySchema>;
export type ProfileInput = z.infer<typeof ProfileSchema>;
export type CreateProfileInput = z.infer<typeof CreateProfileInputSchema>;
export type UpdateProfileInput = z.infer<typeof UpdateProfileInputSchema>;
export type FollowInput = z.infer<typeof FollowSchema>;
export type BlockInput = z.infer<typeof BlockSchema>;
