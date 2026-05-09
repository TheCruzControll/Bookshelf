import { z } from "zod";

export const EntityIdSchema = z.string().uuid();

export const AuthIdentitySchema = z.object({
  userId: EntityIdSchema,
  email: z.string().email().optional(),
});

export const SessionSchema = z.object({
  id: EntityIdSchema,
  userId: EntityIdSchema,
  createdAt: z.date(),
  expiresAt: z.date(),
});

export type AuthIdentityInput = z.infer<typeof AuthIdentitySchema>;
export type SessionInput = z.infer<typeof SessionSchema>;
