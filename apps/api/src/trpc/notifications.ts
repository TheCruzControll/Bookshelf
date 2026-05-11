import { TRPCError } from "@trpc/server";
import {
  AppServices,
  NotificationsListInputSchema,
  NotificationsListOutputSchema,
  NotificationsMarkReadInputSchema,
  NotificationsMarkReadOutputSchema,
} from "@hone/domain";
import { router, publicProcedure } from "./trpc";

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
});
