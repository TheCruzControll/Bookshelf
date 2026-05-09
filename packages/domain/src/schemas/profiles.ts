import { z } from "zod";
import { EntityIdSchema } from "./auth";

export const VisibilitySchema = z.enum(["public", "followers", "mutuals", "private"]);

export const ProfileSchema = z.object({
  id: EntityIdSchema,
  handle: z.string().min(1).max(30),
  displayName: z.string().min(1).max(100),
  bio: z.string().max(500).optional(),
  avatarUrl: z.string().url().optional(),
  defaultVisibility: VisibilitySchema,
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CreateProfileInputSchema = z.object({
  handle: z.string().min(1).max(30),
  displayName: z.string().min(1).max(100),
  bio: z.string().max(500).optional(),
  avatarUrl: z.string().url().optional(),
  defaultVisibility: VisibilitySchema.default("public"),
});

export const UpdateProfileInputSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  bio: z.string().max(500).optional(),
  avatarUrl: z.string().url().optional(),
  defaultVisibility: VisibilitySchema.optional(),
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

export type VisibilityInput = z.infer<typeof VisibilitySchema>;
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
