import { TRPCError } from "@trpc/server";
import {
  AppServices,
  NotificationPlatformSchema,
  NotificationSettingsOutputSchema,
  NotificationsListInputSchema,
  NotificationsListOutputSchema,
  NotificationsMarkReadInputSchema,
  NotificationsMarkReadOutputSchema,
  RegisterTokenInputSchema,
  UpdateNotificationSettingsInputSchema,
} from "@hone/domain";
import { z } from "zod";
import { router, publicProcedure } from "./trpc";

const UnregisterTokenInputSchema = z.object({
  token: z.string().min(1),
});

const RegisterTokenOutputSchema = z.object({
  platform: NotificationPlatformSchema,
  token: z.string(),
  lastSeen: z.date(),
});

const UnregisterTokenOutputSchema = z.object({ success: z.literal(true) });

export const notificationsRouter = router({
  list: publicProcedure
    .input(NotificationsListInputSchema)
    .output(NotificationsListOutputSchema)
    .query(async ({ input, ctx }) => {
      if (!ctx.repositories) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Repositories not configured" });
      }
      if (!ctx.identity) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }
      const services = new AppServices(ctx.repositories, {
        getCurrentIdentity: async () => ctx.identity,
      });
      const listInput: { recipientId: string; cursor?: string; limit: number } = {
        recipientId: ctx.identity.userId,
        limit: input.limit,
      };
      if (input.cursor) {
        listInput.cursor = input.cursor;
      }
      const notifications = await services.notifications.list(listInput);

      const nextCursor =
        notifications.length === input.limit
          ? notifications[notifications.length - 1]!.id
          : null;

      return { notifications, nextCursor };
    }),

  markRead: publicProcedure
    .input(NotificationsMarkReadInputSchema)
    .output(NotificationsMarkReadOutputSchema)
    .mutation(async ({ input, ctx }) => {
      if (!ctx.repositories) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Repositories not configured" });
      }
      if (!ctx.identity) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }
      const services = new AppServices(ctx.repositories, {
        getCurrentIdentity: async () => ctx.identity,
      });
      await services.notifications.markRead({
        recipientId: ctx.identity.userId,
        notificationId: input.notificationId,
      });
      return { success: true };
    }),

  getSettings: publicProcedure
    .input(z.void())
    .output(NotificationSettingsOutputSchema)
    .query(async ({ ctx }) => {
      if (!ctx.repositories) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Repositories not configured" });
      }
      if (!ctx.identity) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }
      const services = new AppServices(ctx.repositories, {
        getCurrentIdentity: async () => ctx.identity,
      });
      return services.notifications.getSettings(ctx.identity.userId);
    }),

  updateSettings: publicProcedure
    .input(UpdateNotificationSettingsInputSchema)
    .output(NotificationSettingsOutputSchema)
    .mutation(async ({ input, ctx }) => {
      if (!ctx.repositories) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Repositories not configured" });
      }
      if (!ctx.identity) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }
      const services = new AppServices(ctx.repositories, {
        getCurrentIdentity: async () => ctx.identity,
      });
      return services.notifications.updateSettings(ctx.identity.userId, input);
    }),

  registerToken: publicProcedure
    .input(RegisterTokenInputSchema)
    .output(RegisterTokenOutputSchema)
    .mutation(async ({ input, ctx }) => {
      if (!ctx.repositories) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Repositories not configured" });
      }
      if (!ctx.identity) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }
      const record = await ctx.repositories.notifications.registerToken({
        profileId: ctx.identity.userId,
        platform: input.platform,
        token: input.token,
      });
      return {
        platform: record.platform,
        token: record.token,
        lastSeen: record.lastSeen,
      };
    }),

  unregisterToken: publicProcedure
    .input(UnregisterTokenInputSchema)
    .output(UnregisterTokenOutputSchema)
    .mutation(async ({ input, ctx }) => {
      if (!ctx.repositories) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Repositories not configured" });
      }
      if (!ctx.identity) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }
      await ctx.repositories.notifications.removeToken({
        profileId: ctx.identity.userId,
        token: input.token,
      });
      return { success: true as const };
    }),
});
