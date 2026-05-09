import type { Context } from "hono";
import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import type { AuthIdentity, AuthProvider, AppRepositories } from "@hone/domain";
import type { Cache } from "@hone/cache";

export interface TrpcContextDeps {
  repositories?: AppRepositories;
  auth?: AuthProvider;
  cache?: Cache;
}

export type TrpcContext = {
  identity: AuthIdentity | null;
  repositories: AppRepositories | undefined;
  cache: Cache | undefined;
  [key: string]: unknown;
};

export function createTrpcContext(deps: TrpcContextDeps) {
  return async (
    _opts: FetchCreateContextFnOptions,
    _c: Context
  ): Promise<TrpcContext> => {
    let identity: AuthIdentity | null = null;
    if (deps.auth) {
      identity = await deps.auth.getCurrentIdentity();
    }
    return {
      identity,
      repositories: deps.repositories,
      cache: deps.cache,
    };
  };
}
