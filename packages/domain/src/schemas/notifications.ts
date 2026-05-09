import { z } from "zod";
import { EntityIdSchema } from "./auth";

export const NotificationPlatformSchema = z.enum(["apns", "fcm"]);

export const NotificationTokenSchema = z.object({
  profileId: EntityIdSchema,
  platform: NotificationPlatformSchema,
  token: z.string().min(1),
  lastSeen: z.date(),
});

export const NotificationSettingSchema = z.object({
  profileId: EntityIdSchema,
  key: z.string().min(1),
  value: z.unknown(),
});

export const RegisterTokenInputSchema = z.object({
  platform: NotificationPlatformSchema,
  token: z.string().min(1),
});

export const SetSettingInputSchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
});

export type NotificationPlatformInput = z.infer<typeof NotificationPlatformSchema>;
export type NotificationTokenInput = z.infer<typeof NotificationTokenSchema>;
export type NotificationSettingInput = z.infer<typeof NotificationSettingSchema>;
export type RegisterTokenInput = z.infer<typeof RegisterTokenInputSchema>;
export type SetSettingInput = z.infer<typeof SetSettingInputSchema>;
