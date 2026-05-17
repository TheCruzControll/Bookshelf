import { TRPCError } from "@trpc/server";
import {
  AppServices,
  CheckHandleInputSchema,
  CheckHandleOutputSchema,
  CreateProfileInputSchema,
  CreateProfileOutputSchema,
  POSTURE_C_DEFAULTS,
  ProfileByHandleInputSchema,
  ProfileByHandleOutputSchema,
  ProfileGoneError,
  ResolveOldHandleInputSchema,
  ResolveOldHandleOutputSchema,
  SetHandleInputSchema,
  SetHandleOutputSchema,
} from "@hone/domain";
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
        defaultVisibility: POSTURE_C_DEFAULTS,
      });
    }),

  resolveOldHandle: publicProcedure
    .input(ResolveOldHandleInputSchema)
    .output(ResolveOldHandleOutputSchema)
    .query(async ({ input, ctx }) => {
      if (!ctx.repositories) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Repositories not configured" });
      }
      const services = new AppServices(ctx.repositories, {
        getCurrentIdentity: async () => null,
      });
      return services.handles.resolveOldHandle(input.handle);
    }),

  /**
   * Public-profile lookup powering `/u/{handle}` (S-06, #161).
   *
   * Resolution order:
   *   1. Live profile exists → return it.
   *   2. No live profile, active tombstone → throw `NOT_FOUND` with a
   *      `ProfileGoneError` cause. The Hono adapter rewrites this to
   *      `HTTP 410 Gone` with an empty body.
   *   3. No live profile, no (or expired) tombstone → plain `NOT_FOUND`
   *      → `HTTP 404`.
   */
  byHandle: publicProcedure
    .input(ProfileByHandleInputSchema)
    .output(ProfileByHandleOutputSchema)
    .query(async ({ input, ctx }) => {
      if (!ctx.repositories) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Repositories not configured",
        });
      }
      const handle = input.handle.toLowerCase();
      const profile = await ctx.repositories.profiles.findByHandle(handle);
      if (profile) {
        return { profile };
      }
      const tombstone =
        await ctx.repositories.deletedProfileTombstones.findByHandle(
          handle,
          new Date(),
        );
      if (tombstone) {
        throw new TRPCError({
          code: "NOT_FOUND",
          cause: new ProfileGoneError({ handle }),
        });
      }
      throw new TRPCError({ code: "NOT_FOUND" });
    }),
});
