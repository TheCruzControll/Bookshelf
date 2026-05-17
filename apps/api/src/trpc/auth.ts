import { TRPCError } from "@trpc/server";
import {
  AppleSignInInputSchema,
  AppleSignInOutputSchema,
  GoogleSignInInputSchema,
  GoogleSignInOutputSchema,
  RequestMagicLinkInputSchema,
  RequestMagicLinkOutputSchema,
  ConsumeMagicLinkInputSchema,
  ConsumeMagicLinkOutputSchema,
  StartPhoneVerifyInputSchema,
  StartPhoneVerifyOutputSchema,
  ConfirmPhoneVerifyInputSchema,
  ConfirmPhoneVerifyOutputSchema,
  SessionCreateInputSchema,
  SessionCreateOutputSchema,
  SessionRotateInputSchema,
  SessionRotateOutputSchema,
  SessionRevokeInputSchema,
  SessionRevokeOutputSchema,
} from "@hone/domain";
import { AuthService, MagicLinkService, PhoneVerifyService, SessionService } from "@hone/domain";
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
        ctx.repositories.magicLinks,
        ctx.repositories.authIdentities,
        ctx.repositories.sessions,
        ctx.emailProvider
      );

      const result = await magicLinkService.requestMagicLink(input.email);
      return result;
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
        ctx.repositories.magicLinks,
        ctx.repositories.authIdentities,
        ctx.repositories.sessions,
        ctx.emailProvider
      );

      try {
        const result = await magicLinkService.consumeMagicLink(input.token);
        return result;
      } catch (err) {
        if (err instanceof Error) {
          const code = (err as Error & { code?: string }).code;
          if (code === "INVALID_TOKEN" || code === "TOKEN_CONSUMED") {
            throw new TRPCError({ code: "UNAUTHORIZED", message: err.message });
          }
          if (code === "TOKEN_EXPIRED") {
            throw new TRPCError({ code: "UNAUTHORIZED", message: "Magic link expired" });
          }
        }
        throw err;
      }
    }),

  startPhoneVerify: publicProcedure
    .input(StartPhoneVerifyInputSchema)
    .output(StartPhoneVerifyOutputSchema)
    .mutation(async ({ input, ctx }) => {
      if (!ctx.repositories) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Repositories not configured" });
      }
      if (!ctx.smsProvider) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "SMS provider not configured" });
      }

      const phoneVerifyService = new PhoneVerifyService(
        ctx.repositories.phoneVerifications,
        ctx.repositories.phoneNumbers,
        ctx.smsProvider,
        ctx.repositories.blocks,
      );

      try {
        const result = await phoneVerifyService.startVerification(input.phoneNumber, ctx.cache);
        return result;
      } catch (err) {
        if (err instanceof Error) {
          const code = (err as Error & { code?: string }).code;
          if (code === "INVALID_PHONE") {
            throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
          }
          if (code === "RATE_LIMITED") {
            throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: err.message });
          }
        }
        throw err;
      }
    }),

  confirmPhoneVerify: publicProcedure
    .input(ConfirmPhoneVerifyInputSchema)
    .output(ConfirmPhoneVerifyOutputSchema)
    .mutation(async ({ input, ctx }) => {
      if (!ctx.repositories) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Repositories not configured" });
      }
      if (!ctx.smsProvider) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "SMS provider not configured" });
      }
      if (!ctx.viewer) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required" });
      }

      const phoneVerifyService = new PhoneVerifyService(
        ctx.repositories.phoneVerifications,
        ctx.repositories.phoneNumbers,
        ctx.smsProvider,
        ctx.repositories.blocks,
      );

      try {
        const result = await phoneVerifyService.confirmVerification(input.phoneNumber, input.code, ctx.viewer.id);
        return result;
      } catch (err) {
        if (err instanceof Error) {
          const code = (err as Error & { code?: string }).code;
          if (code === "INVALID_PHONE") {
            throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
          }
          if (code === "NOT_FOUND") {
            throw new TRPCError({ code: "NOT_FOUND", message: err.message });
          }
          if (code === "CODE_EXPIRED") {
            throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
          }
          if (code === "RATE_LIMITED") {
            throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: err.message });
          }
          if (code === "INVALID_CODE") {
            throw new TRPCError({ code: "UNAUTHORIZED", message: err.message });
          }
        }
        throw err;
      }
    }),

  session: router({
    create: publicProcedure
      .input(SessionCreateInputSchema)
      .output(SessionCreateOutputSchema)
      .mutation(async ({ input, ctx }) => {
        if (!ctx.repositories) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Repositories not configured" });
        }

        const sessionService = new SessionService(ctx.repositories.sessions);

        const result = await sessionService.create(input.profileId);
        return result;
      }),

    rotate: publicProcedure
      .input(SessionRotateInputSchema)
      .output(SessionRotateOutputSchema)
      .mutation(async ({ input, ctx }) => {
        if (!ctx.repositories) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Repositories not configured" });
        }

        const sessionService = new SessionService(ctx.repositories.sessions);

        try {
          const result = await sessionService.rotate(input.currentToken);
          return result;
        } catch (err) {
          if (err instanceof Error) {
            const code = (err as Error & { code?: string }).code;
            if (code === "SESSION_NOT_FOUND") {
              throw new TRPCError({ code: "NOT_FOUND", message: err.message });
            }
            if (code === "SESSION_REVOKED") {
              throw new TRPCError({ code: "UNAUTHORIZED", message: err.message });
            }
            if (code === "SESSION_EXPIRED") {
              throw new TRPCError({ code: "UNAUTHORIZED", message: err.message });
            }
          }
          throw err;
        }
      }),

    revoke: publicProcedure
      .input(SessionRevokeInputSchema)
      .output(SessionRevokeOutputSchema)
      .mutation(async ({ input, ctx }) => {
        if (!ctx.repositories) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Repositories not configured" });
        }

        const sessionService = new SessionService(ctx.repositories.sessions);

        try {
          await sessionService.revoke(input.token);
          return { revoked: true };
        } catch (err) {
          if (err instanceof Error) {
            const code = (err as Error & { code?: string }).code;
            if (code === "SESSION_NOT_FOUND") {
              throw new TRPCError({ code: "NOT_FOUND", message: err.message });
            }
          }
          throw err;
        }
      }),
  }),
});
