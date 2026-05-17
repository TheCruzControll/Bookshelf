/**
 * Domain error classes that signal an account has been hard-deleted and
 * the corresponding public surface should answer with HTTP 410 Gone
 * (S-06, #161).
 *
 * tRPC's built-in error codes do not include `GONE`, so services attach
 * this class as the `cause` of a `TRPCError({ code: "NOT_FOUND" })`.
 * The tRPC error formatter detects the cause, decorates the wire
 * payload with `data.code = "GONE"`, and the Hono adapter rewrites the
 * response to `HTTP 410` with an empty body before flushing it to the
 * client. See `apps/api/src/middleware.ts` (`goneRewriteMiddleware`)
 * and `apps/api/src/trpc/trpc.ts` (`errorFormatter`).
 */

/**
 * Sentinel discriminator written into the tRPC error payload (`data.code`)
 * when the route is known to be tombstoned. The Hono middleware reads
 * this value to decide whether to rewrite a `404` response to `410`.
 */
export const PROFILE_GONE_CODE = "GONE" as const;

/**
 * Server-side error class. Throw as the `cause` of a tRPC
 * `NOT_FOUND` error from any public-profile procedure when the looked-up
 * handle has an active tombstone:
 *
 *   throw new TRPCError({
 *     code: "NOT_FOUND",
 *     cause: new ProfileGoneError({ handle }),
 *   });
 *
 * The accompanying error formatter / middleware translates this into
 * an `HTTP 410 Gone` response with no body content.
 */
export class ProfileGoneError extends Error {
  readonly code = PROFILE_GONE_CODE;
  readonly handle: string;
  constructor(input: { handle: string; message?: string }) {
    super(input.message ?? `Profile @${input.handle} has been deleted`);
    this.name = "ProfileGoneError";
    this.handle = input.handle;
  }
}
