import { TRPCError } from "@trpc/server";
import { parsePhoneNumber, isValidPhoneNumber } from "libphonenumber-js";
import {
  AppServices,
  ConfirmPhoneVerifyInputSchema,
  ConfirmPhoneVerifyOutputSchema,
  StartPhoneVerifyInputSchema,
  StartPhoneVerifyOutputSchema,
} from "@hone/domain";
import type { SmsProvider } from "@hone/domain";
import { router, publicProcedure } from "./trpc";

const SMS_RATE_WINDOW_MS = 60_000;
const SMS_RATE_MAX = 5;
const CONFIRM_RATE_WINDOW_MS = 60_000;
const CONFIRM_RATE_MAX = 10;

function normalizeE164(raw: string): string {
  if (!isValidPhoneNumber(raw)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Invalid phone number — must be a valid international phone number",
    });
  }
  return parsePhoneNumber(raw).format("E.164");
}

export function createAuthRouter(sms?: SmsProvider) {
  return router({
    startPhoneVerify: publicProcedure
      .input(StartPhoneVerifyInputSchema)
      .output(StartPhoneVerifyOutputSchema)
      .mutation(async ({ input, ctx }) => {
        if (!ctx.repositories) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Repositories not configured" });
        }
        if (!ctx.identity) {
          throw new TRPCError({ code: "UNAUTHORIZED" });
        }

        const phoneE164 = normalizeE164(input.phone);

        if (ctx.cache) {
          const windowStart = Math.floor(Date.now() / SMS_RATE_WINDOW_MS);
          const key = `rl:sms:${ctx.identity.userId}:${windowStart}`;
          const count = await ctx.cache.incr(key, 1, SMS_RATE_WINDOW_MS);
          if (count > SMS_RATE_MAX) {
            throw new TRPCError({
              code: "TOO_MANY_REQUESTS",
              message: "Too many SMS requests — please wait before retrying",
            });
          }
        }

        const services = new AppServices(
          ctx.repositories,
          { getCurrentIdentity: async () => ctx.identity },
          sms
        );

        const verification = await services.phoneVerify.startVerify({
          profileId: ctx.identity.userId,
          phoneE164,
        });

        return { expiresAt: verification.expiresAt };
      }),

    confirmPhoneVerify: publicProcedure
      .input(ConfirmPhoneVerifyInputSchema)
      .output(ConfirmPhoneVerifyOutputSchema)
      .mutation(async ({ input, ctx }) => {
        if (!ctx.repositories) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Repositories not configured" });
        }
        if (!ctx.identity) {
          throw new TRPCError({ code: "UNAUTHORIZED" });
        }

        const phoneE164 = normalizeE164(input.phone);

        if (ctx.cache) {
          const windowStart = Math.floor(Date.now() / CONFIRM_RATE_WINDOW_MS);
          const key = `rl:confirm:${ctx.identity.userId}:${windowStart}`;
          const count = await ctx.cache.incr(key, 1, CONFIRM_RATE_WINDOW_MS);
          if (count > CONFIRM_RATE_MAX) {
            throw new TRPCError({
              code: "TOO_MANY_REQUESTS",
              message: "Too many confirmation attempts — please wait before retrying",
            });
          }
        }

        const services = new AppServices(
          ctx.repositories,
          { getCurrentIdentity: async () => ctx.identity },
          sms
        );

        const result = await services.phoneVerify.confirmVerify({
          profileId: ctx.identity.userId,
          phoneE164,
          code: input.code,
        });

        return result;
      }),
  });
}

export const authRouter = createAuthRouter();
