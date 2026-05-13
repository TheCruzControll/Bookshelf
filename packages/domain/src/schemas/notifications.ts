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

export const NotificationChannelSchema = z.enum(["push", "in_app"]);

/**
 * Quiet hours window expressed as minutes-from-midnight in the user's
 * local timezone. When start > end the window wraps midnight (e.g.
 * 22:00–08:00). Both endpoints are inclusive.
 */
export const QuietHoursSchema = z.object({
  enabled: z.boolean(),
  startMinute: z.number().int().min(0).max(24 * 60 - 1),
  endMinute: z.number().int().min(0).max(24 * 60 - 1),
});

const TriggerTogglesShape = {
  new_follower: z.boolean(),
  mutual_follow_back: z.boolean(),
  mutual_rated_high: z.boolean(),
  mutual_finished_want_to_read: z.boolean(),
  security_event: z.boolean(),
} as const;

const ChannelTogglesShape = {
  push: z.boolean(),
  in_app: z.boolean(),
} as const;

export const NotificationSettingsSchema = z.object({
  masterEnabled: z.boolean(),
  channels: z.object(ChannelTogglesShape),
  triggers: z.object(TriggerTogglesShape),
  quietHours: QuietHoursSchema,
});

/** Deep-partial input for updateSettings — every nested field is optional. */
export const UpdateNotificationSettingsInputSchema = z.object({
  masterEnabled: z.boolean().optional(),
  channels: z.object({
    push: z.boolean().optional(),
    in_app: z.boolean().optional(),
  }).partial().optional(),
  triggers: z.object({
    new_follower: z.boolean().optional(),
    mutual_follow_back: z.boolean().optional(),
    mutual_rated_high: z.boolean().optional(),
    mutual_finished_want_to_read: z.boolean().optional(),
    security_event: z.boolean().optional(),
  }).partial().optional(),
  quietHours: z.object({
    enabled: z.boolean().optional(),
    startMinute: z.number().int().min(0).max(24 * 60 - 1).optional(),
    endMinute: z.number().int().min(0).max(24 * 60 - 1).optional(),
  }).partial().optional(),
});

export const NotificationSettingsOutputSchema = NotificationSettingsSchema;

/** Key under which the merged settings blob is stored in notification_settings. */
export const NOTIFICATION_SETTINGS_KEY = "notifications";

/** Caps applied server-side per acceptance criteria. Constants — not user-editable. */
export const NOTIFICATION_CAP_PER_RECIPIENT_DAY = 5;
export const NOTIFICATION_CAP_PER_ACTOR_DAY = 3;

export const DEFAULT_NOTIFICATION_SETTINGS = {
  masterEnabled: true,
  channels: { push: true, in_app: true },
  triggers: {
    new_follower: true,
    mutual_follow_back: true,
    mutual_rated_high: true,
    mutual_finished_want_to_read: true,
    security_event: true,
  },
  quietHours: { enabled: false, startMinute: 22 * 60, endMinute: 8 * 60 },
} as const satisfies z.infer<typeof NotificationSettingsSchema>;

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
export type NotificationChannel = z.infer<typeof NotificationChannelSchema>;
export type QuietHours = z.infer<typeof QuietHoursSchema>;
export type NotificationSettingsValue = z.infer<typeof NotificationSettingsSchema>;
export type UpdateNotificationSettingsInput = z.infer<typeof UpdateNotificationSettingsInputSchema>;
