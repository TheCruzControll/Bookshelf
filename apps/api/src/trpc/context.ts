import { createHash } from "node:crypto";
import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import type { AuthIdentity, AuthProvider, AppRepositories, AppleJwksProvider, GoogleJwksProvider, EmailProvider, SmsProvider, Profile } from "@hone/domain";
import type { Cache } from "@hone/cache";

export interface TrpcContextDeps {
  repositories?: AppRepositories;
  auth?: AuthProvider;
  cache?: Cache;
  jwksProvider?: AppleJwksProvider;
  appleAudience?: string;
  googleJwksProvider?: GoogleJwksProvider;
  googleAudience?: string;
  emailProvider?: EmailProvider;
  smsProvider?: SmsProvider;
}

export type TrpcContext = {
  identity: AuthIdentity | null;
  viewer: Profile | null;
  repositories: AppRepositories | undefined;
  cache: Cache | undefined;
  jwksProvider: AppleJwksProvider | undefined;
  appleAudience: string | undefined;
  googleJwksProvider: GoogleJwksProvider | undefined;
  googleAudience: string | undefined;
  emailProvider: EmailProvider | undefined;
  smsProvider: SmsProvider | undefined;
  /**
   * Viewer locale parsed from the incoming `Accept-Language` header.
   *
   * Used by surfaces that need locale-sensitive behavior — e.g. the F-07
   * (#73) search re-ranker boosts results whose language matches the
   * viewer's locale language code. `undefined` when the header is missing
   * or unparseable; downstream callers must treat absence as "no preference".
   */
  locale: string | undefined;
  [key: string]: unknown;
};

function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(authHeader);
  return match?.[1] ?? null;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Parse an `Accept-Language` HTTP header and return the highest-priority
 * locale tag, or `undefined` if the header is missing / malformed.
 *
 * Trims trailing q-factor parameters (`en-US;q=0.9` -> `en-US`) and picks
 * the first non-wildcard tag. We deliberately do NOT do full RFC 7231
 * q-value sorting — clients almost always list their preferred locale
 * first, and the F-07 ranker only needs a primary-language code anyway.
 */
export function parseAcceptLanguage(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const trimmed = header.trim();
  if (trimmed.length === 0) return undefined;
  const first = trimmed.split(",")[0]?.trim();
  if (!first) return undefined;
  // Strip any `;q=...` suffix.
  const tag = first.split(";")[0]?.trim();
  if (!tag || tag === "*") return undefined;
  return tag;
}

export function createTrpcContext(deps: TrpcContextDeps) {
  return async (
    _opts: FetchCreateContextFnOptions,
    c: Context
  ): Promise<TrpcContext> => {
    let identity: AuthIdentity | null = null;
    if (deps.auth) {
      identity = await deps.auth.getCurrentIdentity();
    }

    let viewer: Profile | null = null;

    if (deps.repositories) {
      const authHeader = c.req.header("authorization");
      const bearerToken = extractBearerToken(authHeader);
      const cookieToken = getCookie(c, "session");
      const rawToken = bearerToken ?? cookieToken ?? null;

      if (rawToken) {
        const tokenHash = hashToken(rawToken);
        const session = await deps.repositories.sessions.findByTokenHash(tokenHash);

        if (session && !session.revokedAt && session.expiresAt > new Date()) {
          viewer = await deps.repositories.profiles.findById(session.profileId);
        }
      }
    }

    const locale = parseAcceptLanguage(c.req.header("accept-language"));

    return {
      identity,
      viewer,
      repositories: deps.repositories,
      cache: deps.cache,
      jwksProvider: deps.jwksProvider,
      appleAudience: deps.appleAudience,
      googleJwksProvider: deps.googleJwksProvider,
      googleAudience: deps.googleAudience,
      emailProvider: deps.emailProvider,
      smsProvider: deps.smsProvider,
      locale,
    };
  };
}
