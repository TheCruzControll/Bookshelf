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

export const StartPhoneVerifyInputSchema = z.object({
  phone: z.string().min(1),
});

export const StartPhoneVerifyOutputSchema = z.object({
  expiresAt: z.date(),
});

export const ConfirmPhoneVerifyInputSchema = z.object({
  phone: z.string().min(1),
  code: z.string().length(6),
});

export const ConfirmPhoneVerifyOutputSchema = z.object({
  verified: z.boolean(),
});

export type StartPhoneVerifyInput = z.infer<typeof StartPhoneVerifyInputSchema>;
export type StartPhoneVerifyOutput = z.infer<typeof StartPhoneVerifyOutputSchema>;
export type ConfirmPhoneVerifyInput = z.infer<typeof ConfirmPhoneVerifyInputSchema>;
export type ConfirmPhoneVerifyOutput = z.infer<typeof ConfirmPhoneVerifyOutputSchema>;
