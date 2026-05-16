import { TRPCError } from "@trpc/server";
import {
  AppServices,
  ContactsUploadInputSchema,
  ContactsUploadOutputSchema,
  ContactsMatchInputSchema,
  ContactsMatchOutputSchema,
  ContactsDeleteOutputSchema,
} from "@hone/domain";
import { router, publicProcedure } from "./trpc";

export const contactsRouter = router({
  upload: publicProcedure
    .input(ContactsUploadInputSchema)
    .output(ContactsUploadOutputSchema)
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

      // Validate the submitted salt version matches the active salt
      try {
        await services.contacts.validateSaltVersion(input.saltVersion);
      } catch (err: unknown) {
        const error = err as { code?: string; expectedVersion?: number; message?: string };
        if (error.code === "STALE_SALT") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error.message ?? "Stale salt version",
            cause: err,
          });
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Salt validation failed" });
      }

      const phoneHashes = input.phoneHashes;
      const emailHashes = input.emailHashes;

      await Promise.all([
        phoneHashes.length > 0
          ? services.contacts.uploadPhoneHashes({
              userId: ctx.identity.userId,
              hashes: phoneHashes,
            })
          : Promise.resolve(),
        emailHashes.length > 0
          ? services.contacts.uploadEmailHashes({
              userId: ctx.identity.userId,
              hashes: emailHashes,
            })
          : Promise.resolve(),
      ]);

      return {
        success: true,
        phonesUploaded: phoneHashes.length,
        emailsUploaded: emailHashes.length,
      };
    }),

  match: publicProcedure
    .input(ContactsMatchInputSchema)
    .output(ContactsMatchOutputSchema)
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

      const matches = await services.contacts.match({
        viewerId: ctx.identity.userId,
      });

      return { matches };
    }),

  delete: publicProcedure
    .output(ContactsDeleteOutputSchema)
    .mutation(async ({ ctx }) => {
      if (!ctx.repositories) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Repositories not configured" });
      }
      if (!ctx.identity) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }
      const services = new AppServices(ctx.repositories, {
        getCurrentIdentity: async () => ctx.identity,
      });

      await services.contacts.deleteForUser(ctx.identity.userId);

      return { success: true };
    }),
});
