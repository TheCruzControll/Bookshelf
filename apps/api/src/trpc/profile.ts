import { TRPCError } from "@trpc/server";
import {
  AppServices,
  CheckHandleInputSchema,
  CheckHandleOutputSchema,
  CreateProfileInputSchema,
  CreateProfileOutputSchema,
  HandleSchema,
  SetHandleInputSchema,
  SetHandleOutputSchema,
} from "@hone/domain";
import { z } from "zod";
import { router, publicProcedure } from "./trpc";

export const profileRouter = router({
  checkHandle: publicProcedure
    .input(CheckHandleInputSchema)
    .output(CheckHandleOutputSchema)
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
      return services.handles.checkHandle(input.handle);
    }),

  setHandle: publicProcedure
    .input(SetHandleInputSchema)
    .output(SetHandleOutputSchema)
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
      try {
        const profile = await services.handles.setHandle(ctx.identity.userId, input.handle);
        return { profile };
      } catch (err) {
        if (err instanceof Error && (err as NodeJS.ErrnoException & { code?: string }).code === "HANDLE_TAKEN") {
          throw new TRPCError({
            code: "CONFLICT",
            message: err.message,
          });
        }
        throw err;
      }
    }),

  createProfile: publicProcedure
    .input(CreateProfileInputSchema)
    .output(CreateProfileOutputSchema)
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
      return services.profiles.createProfile({
        id: ctx.identity.userId,
        handle: input.handle.toLowerCase(),
        displayName: input.displayName,
        defaultVisibility: input.defaultVisibility,
      });
    }),

  resolveHandle: publicProcedure
    .input(z.object({ handle: HandleSchema }))
    .output(z.object({ currentHandle: z.string().nullable() }))
    .query(async ({ input, ctx }) => {
      if (!ctx.repositories) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Repositories not configured" });
      }
      const handle = input.handle.toLowerCase();
      const active = await ctx.repositories.profiles.findByHandle(handle);
      if (active) {
        return { currentHandle: active.handle };
      }
      const history = await ctx.repositories.handleHistory.findByOldHandle(handle);
      if (!history) {
        return { currentHandle: null };
      }
      const profile = await ctx.repositories.profiles.findById(history.profileId);
      return { currentHandle: profile?.handle ?? null };
    }),
});
