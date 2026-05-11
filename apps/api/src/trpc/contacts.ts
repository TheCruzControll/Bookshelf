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

      const [phoneMatches, emailMatches] = await Promise.all([
        input.phoneHashes.length > 0
          ? services.contacts.matchPhones({
              hashes: input.phoneHashes,
              viewerId: ctx.identity.userId,
            })
          : Promise.resolve([]),
        input.emailHashes.length > 0
          ? services.contacts.matchEmails({
              hashes: input.emailHashes,
              viewerId: ctx.identity.userId,
            })
          : Promise.resolve([]),
      ]);

      // Deduplicate matches from both indexes
      const uniqueMatches = [...new Set([...phoneMatches, ...emailMatches])];

      return { matches: uniqueMatches };
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
