import { TRPCError } from "@trpc/server";
import { AppleSignInInputSchema, AppleSignInOutputSchema } from "@hone/domain";
import type { AppleJwk, AppleJwksProvider } from "@hone/domain";
import { AuthService } from "@hone/domain";
import { router, publicProcedure } from "./trpc";

const APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys";
const APPLE_AUDIENCE = process.env["APPLE_APP_BUNDLE_ID"] ?? "com.hone.app";

export class FetchAppleJwksProvider implements AppleJwksProvider {
  async fetchKeys(): Promise<AppleJwk[]> {
    const res = await fetch(APPLE_JWKS_URL);
    if (!res.ok) {
      throw new Error(`Failed to fetch Apple JWKS: ${res.status}`);
    }
    const json = await res.json() as { keys: AppleJwk[] };
    return json.keys;
  }
}

export const authRouter = router({
  appleSignIn: publicProcedure
    .input(AppleSignInInputSchema)
    .output(AppleSignInOutputSchema)
    .mutation(async ({ input, ctx }) => {
      if (!ctx.repositories) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Repositories not configured" });
      }

      const jwksProvider = new FetchAppleJwksProvider();
      const authService = new AuthService(
        ctx.repositories.authIdentities,
        ctx.repositories.sessions,
        jwksProvider,
        APPLE_AUDIENCE
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
