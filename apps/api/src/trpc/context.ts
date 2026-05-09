import { createHash } from "node:crypto";
import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import type { AuthIdentity, AuthProvider, AppRepositories, Profile } from "@hone/domain";
import type { Cache } from "@hone/cache";

export interface TrpcContextDeps {
  repositories?: AppRepositories;
  auth?: AuthProvider;
  cache?: Cache;
}

export type TrpcContext = {
  identity: AuthIdentity | null;
  viewer: Profile | null;
  repositories: AppRepositories | undefined;
  cache: Cache | undefined;
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

    return {
      identity,
      viewer,
      repositories: deps.repositories,
      cache: deps.cache,
    };
  };
}
