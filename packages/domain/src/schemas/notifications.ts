import { z } from "zod";
import { EntityIdSchema } from "./auth";

export const NotificationPlatformSchema = z.enum(["apns", "fcm"]);

export const NotificationTokenSchema = z.object({
  id: EntityIdSchema,
  userId: EntityIdSchema,
  platform: NotificationPlatformSchema,
  token: z.string().min(1),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const RegisterTokenInputSchema = z.object({
  platform: NotificationPlatformSchema,
  token: z.string().min(1),
});

export type NotificationPlatformInput = z.infer<typeof NotificationPlatformSchema>;
export type NotificationTokenInput = z.infer<typeof NotificationTokenSchema>;
export type RegisterTokenInput = z.infer<typeof RegisterTokenInputSchema>;
