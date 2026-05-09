import { TRPCError } from "@trpc/server";
import { AppleSignInInputSchema, AppleSignInOutputSchema } from "@hone/domain";
import { AuthService } from "@hone/domain";
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
});
