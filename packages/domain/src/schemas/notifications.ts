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

export const NotificationTriggerSchema = z.enum([
  "new_follower",
  "mutual_follow_back",
  "mutual_rated_high",
  "mutual_finished_want_to_read",
  "security_event",
]);

export const InAppNotificationSchema = z.object({
  id: EntityIdSchema,
  recipientId: EntityIdSchema,
  actorId: EntityIdSchema.optional(),
  trigger: NotificationTriggerSchema,
  payload: z.record(z.string(), z.unknown()),
  readAt: z.date().optional(),
  createdAt: z.date(),
});

export const NotificationsListInputSchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

export const NotificationsListOutputSchema = z.object({
  notifications: z.array(InAppNotificationSchema),
  nextCursor: z.string().nullable(),
});

export const NotificationsMarkReadInputSchema = z.object({
  notificationId: EntityIdSchema,
});

export const NotificationsMarkReadOutputSchema = z.object({
  success: z.boolean(),
});

export type NotificationTriggerInput = z.infer<typeof NotificationTriggerSchema>;
export type InAppNotificationInput = z.infer<typeof InAppNotificationSchema>;
export type NotificationsListInput = z.infer<typeof NotificationsListInputSchema>;
export type NotificationsListOutput = z.infer<typeof NotificationsListOutputSchema>;
export type NotificationsMarkReadInput = z.infer<typeof NotificationsMarkReadInputSchema>;
export type NotificationsMarkReadOutput = z.infer<typeof NotificationsMarkReadOutputSchema>;
