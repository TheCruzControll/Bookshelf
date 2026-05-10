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

export const AppleSignInInputSchema = z.object({
  identityToken: z.string().min(1),
  nonce: z.string().optional(),
});

export const AppleSignInOutputSchema = z.object({
  sessionToken: z.string(),
  expiresAt: z.date(),
  isNewUser: z.boolean(),
});

export type AuthIdentityInput = z.infer<typeof AuthIdentitySchema>;
export type SessionInput = z.infer<typeof SessionSchema>;
export type AppleSignInInput = z.infer<typeof AppleSignInInputSchema>;
export type AppleSignInOutput = z.infer<typeof AppleSignInOutputSchema>;
