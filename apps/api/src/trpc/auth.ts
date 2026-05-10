import { TRPCError } from "@trpc/server";
import {
  AppleSignInInputSchema,
  AppleSignInOutputSchema,
  ConsumeMagicLinkInputSchema,
  ConsumeMagicLinkOutputSchema,
  GoogleSignInInputSchema,
  GoogleSignInOutputSchema,
  RequestMagicLinkInputSchema,
  RequestMagicLinkOutputSchema,
} from "@hone/domain";
import { AuthService, MagicLinkService } from "@hone/domain";
import { router, publicProcedure } from "./trpc";

export const authRouter = router({
  appleSignIn: publicProcedure
    .input(AppleSignInInputSchema)
    .output(AppleSignInOutputSchema)
    .mutation(async ({ input, ctx }) => {
      if (!ctx.repositories) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Repositories not configured" });
      }
      if (!ctx.jwksProvider) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "JWKS provider not configured" });
      }

      const appleAudience = ctx.appleAudience ?? "com.hone.app";
      const authService = new AuthService(
        ctx.repositories.authIdentities,
        ctx.repositories.sessions,
        ctx.jwksProvider,
        appleAudience
      );

      try {
        const result = await authService.appleSignIn(input.identityToken, input.nonce);
        return result;
      } catch (err) {
        if (err instanceof Error) {
          const code = (err as Error & { code?: string }).code;
          if (code === "TOKEN_EXPIRED") {
            throw new TRPCError({ code: "UNAUTHORIZED", message: "Token expired" });
          }
          if (code === "INVALID_TOKEN") {
            throw new TRPCError({ code: "UNAUTHORIZED", message: err.message });
          }
        }
        throw err;
      }
    }),

  googleSignIn: publicProcedure
    .input(GoogleSignInInputSchema)
    .output(GoogleSignInOutputSchema)
    .mutation(async ({ input, ctx }) => {
      if (!ctx.repositories) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Repositories not configured" });
      }
      if (!ctx.googleJwksProvider) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Google JWKS provider not configured" });
      }

      const appleAudience = ctx.appleAudience ?? "com.hone.app";
      const appleJwksProvider = ctx.jwksProvider ?? { fetchKeys: async () => [] };
      const authService = new AuthService(
        ctx.repositories.authIdentities,
        ctx.repositories.sessions,
        appleJwksProvider,
        appleAudience,
        ctx.googleJwksProvider,
        ctx.googleAudience
      );

      try {
        const result = await authService.googleSignIn(input.idToken);
        return result;
      } catch (err) {
        if (err instanceof Error) {
          const code = (err as Error & { code?: string }).code;
          if (code === "TOKEN_EXPIRED") {
            throw new TRPCError({ code: "UNAUTHORIZED", message: "Token expired" });
          }
          if (code === "INVALID_TOKEN") {
            throw new TRPCError({ code: "UNAUTHORIZED", message: err.message });
          }
        }
        throw err;
      }
    }),

  requestMagicLink: publicProcedure
    .input(RequestMagicLinkInputSchema)
    .output(RequestMagicLinkOutputSchema)
    .mutation(async ({ input, ctx }) => {
      if (!ctx.repositories) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Repositories not configured" });
      }
      if (!ctx.emailProvider) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Email provider not configured" });
      }

      const magicLinkService = new MagicLinkService(
        ctx.repositories.magicLinkTokens,
        ctx.repositories.authIdentities,
        ctx.repositories.sessions,
        ctx.emailProvider,
        ctx.appBaseUrl ?? ""
      );

      await magicLinkService.requestMagicLink(input.email);
      return { sent: true };
    }),

  consumeMagicLink: publicProcedure
    .input(ConsumeMagicLinkInputSchema)
    .output(ConsumeMagicLinkOutputSchema)
    .mutation(async ({ input, ctx }) => {
      if (!ctx.repositories) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Repositories not configured" });
      }
      if (!ctx.emailProvider) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Email provider not configured" });
      }

      const magicLinkService = new MagicLinkService(
        ctx.repositories.magicLinkTokens,
        ctx.repositories.authIdentities,
        ctx.repositories.sessions,
        ctx.emailProvider,
        ctx.appBaseUrl ?? ""
      );

      try {
        const result = await magicLinkService.consumeMagicLink(input.token);
        return result;
      } catch (err) {
        if (err instanceof Error) {
          const code = (err as Error & { code?: string }).code;
          if (code === "TOKEN_EXPIRED") {
            throw new TRPCError({ code: "UNAUTHORIZED", message: "Magic link token expired" });
          }
          if (code === "TOKEN_USED") {
            throw new TRPCError({ code: "UNAUTHORIZED", message: "Magic link token already used" });
          }
          if (code === "INVALID_TOKEN") {
            throw new TRPCError({ code: "UNAUTHORIZED", message: err.message });
          }
        }
        throw err;
      }
    }),
});
