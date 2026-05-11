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

export const ProfileSchema = z.object({
  id: EntityIdSchema,
  handle: z.string().min(1).max(30),
  displayName: z.string().min(1).max(100),
  bio: z.string().max(500).optional(),
  avatarUrl: z.string().url().optional(),
  verified: z.boolean(),
  defaultVisibility: DefaultVisibilitySchema,
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CreateProfileInputSchema = z.object({
  handle: z.string().min(1).max(30),
  displayName: z.string().min(1).max(100),
  bio: z.string().max(500).optional(),
  avatarUrl: z.string().url().optional(),
});

export const UpdateProfileInputSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  bio: z.string().max(500).optional(),
  avatarUrl: z.string().url().optional(),
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

export const HandleSchema = z
  .string()
  .min(3)
  .max(30)
  .regex(/^[a-zA-Z0-9_]+$/, "Handle may only contain letters, numbers, and underscores");

export const CheckHandleInputSchema = z.object({
  handle: HandleSchema,
});

export const CheckHandleOutputSchema = z.object({
  available: z.boolean(),
  suggestions: z.array(z.string()),
});

export const SetHandleInputSchema = z.object({
  handle: HandleSchema,
});

export const SetHandleOutputSchema = z.object({
  profile: ProfileSchema,
});

export const SystemShelfResponseSchema = z.object({
  id: EntityIdSchema,
  ownerId: EntityIdSchema,
  name: z.string(),
  slug: z.string(),
  visibility: VisibilitySchema,
  isSystem: z.boolean(),
  kind: z.enum(["system", "custom", "list"]),
  authorType: z.enum(["user", "internal_editorial", "algorithmic"]),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CreateProfileOutputSchema = z.object({
  profile: ProfileSchema,
  shelves: z.array(SystemShelfResponseSchema),
});

export type VisibilityInput = z.infer<typeof VisibilitySchema>;
export type ContentTypeInput = z.infer<typeof ContentTypeSchema>;
export type DefaultVisibilityInput = z.infer<typeof DefaultVisibilitySchema>;
export type ProfileInput = z.infer<typeof ProfileSchema>;
export type CreateProfileInput = z.infer<typeof CreateProfileInputSchema>;
export type UpdateProfileInput = z.infer<typeof UpdateProfileInputSchema>;
export type FollowInput = z.infer<typeof FollowSchema>;
export type BlockInput = z.infer<typeof BlockSchema>;
export type HandleInput = z.infer<typeof HandleSchema>;
export type CheckHandleInput = z.infer<typeof CheckHandleInputSchema>;
export type CheckHandleOutput = z.infer<typeof CheckHandleOutputSchema>;
export type SetHandleInput = z.infer<typeof SetHandleInputSchema>;
export type SetHandleOutput = z.infer<typeof SetHandleOutputSchema>;
export type CreateProfileOutput = z.infer<typeof CreateProfileOutputSchema>;

export const ResolveOldHandleInputSchema = z.object({
  handle: HandleSchema,
});

export const ResolveOldHandleOutputSchema = z
  .object({ currentHandle: z.string() })
  .nullable();

export type ResolveOldHandleInput = z.infer<typeof ResolveOldHandleInputSchema>;
export type ResolveOldHandleOutput = z.infer<typeof ResolveOldHandleOutputSchema>;
