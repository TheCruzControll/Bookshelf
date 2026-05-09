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
  version: z.number().int().positive(),
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

export type VisibilityInput = z.infer<typeof VisibilitySchema>;
export type ProfileInput = z.infer<typeof ProfileSchema>;
export type CreateProfileInput = z.infer<typeof CreateProfileInputSchema>;
export type UpdateProfileInput = z.infer<typeof UpdateProfileInputSchema>;
export type FollowInput = z.infer<typeof FollowSchema>;
export type BlockInput = z.infer<typeof BlockSchema>;
