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

export const GoogleSignInInputSchema = z.object({
  idToken: z.string().min(1),
});

export const GoogleSignInOutputSchema = z.object({
  sessionToken: z.string(),
  expiresAt: z.date(),
  isNewUser: z.boolean(),
});

export type AuthIdentityInput = z.infer<typeof AuthIdentitySchema>;
export type SessionInput = z.infer<typeof SessionSchema>;
export type AppleSignInInput = z.infer<typeof AppleSignInInputSchema>;
export type AppleSignInOutput = z.infer<typeof AppleSignInOutputSchema>;
export type GoogleSignInInput = z.infer<typeof GoogleSignInInputSchema>;
export type GoogleSignInOutput = z.infer<typeof GoogleSignInOutputSchema>;

export const RequestMagicLinkInputSchema = z.object({
  email: z.string().email(),
});

export const RequestMagicLinkOutputSchema = z.object({
  expiresAt: z.date(),
});

export const ConsumeMagicLinkInputSchema = z.object({
  token: z.string().min(1),
});

export const ConsumeMagicLinkOutputSchema = z.object({
  sessionToken: z.string(),
  expiresAt: z.date(),
  isNewUser: z.boolean(),
});

export type RequestMagicLinkInput = z.infer<typeof RequestMagicLinkInputSchema>;
export type RequestMagicLinkOutput = z.infer<typeof RequestMagicLinkOutputSchema>;
export type ConsumeMagicLinkInput = z.infer<typeof ConsumeMagicLinkInputSchema>;
export type ConsumeMagicLinkOutput = z.infer<typeof ConsumeMagicLinkOutputSchema>;

export const StartPhoneVerifyInputSchema = z.object({
  phoneNumber: z.string().min(1),
});

export const StartPhoneVerifyOutputSchema = z.object({
  expiresAt: z.date(),
});

export const ConfirmPhoneVerifyInputSchema = z.object({
  phoneNumber: z.string().min(1),
  code: z.string().length(6),
});

export const ConfirmPhoneVerifyOutputSchema = z.object({
  verified: z.boolean(),
});

export type StartPhoneVerifyInput = z.infer<typeof StartPhoneVerifyInputSchema>;
export type StartPhoneVerifyOutput = z.infer<typeof StartPhoneVerifyOutputSchema>;
export type ConfirmPhoneVerifyInput = z.infer<typeof ConfirmPhoneVerifyInputSchema>;
export type ConfirmPhoneVerifyOutput = z.infer<typeof ConfirmPhoneVerifyOutputSchema>;
