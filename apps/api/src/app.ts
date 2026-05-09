import { Hono } from "hono";
import { trpcServer } from "@hono/trpc-server";
import { z } from "zod";
import type { AppRepositories, AppleJwk, AppleJwksProvider, AuthProvider } from "@hone/domain";
import { AppServices } from "@hone/domain";
import { clearSentryUser, setSentryUser } from "@hone/observability";
import type { Cache } from "@hone/cache";
import { createTrpcContext } from "./trpc/context";
import { appRouter } from "./trpc/router";
import { requestIdMiddleware, accessLogMiddleware, otelHook, rateLimitMiddleware } from "./middleware";

const APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys";

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

export interface ApiDependencies {
  repositories?: AppRepositories;
  auth?: AuthProvider;
  cache?: Cache;
  jwksProvider?: AppleJwksProvider;
  appleAudience?: string;
}

const addBookSchema = z.object({
  ownerId: z.string().uuid(),
  shelfId: z.string().uuid(),
  bookId: z.string().uuid(),
  editionId: z.string().uuid().optional()
});

export function createApi(dependencies: ApiDependencies = {}) {
  const app = new Hono();

  app.use("*", requestIdMiddleware());
  app.use("*", otelHook());
  app.use("*", accessLogMiddleware());

  app.use("*", async (c, next) => {
    if (dependencies.auth) {
      const identity = await dependencies.auth.getCurrentIdentity();
      if (identity) {
        const userCtx: { id: string; email?: string } = { id: identity.userId };
        if (identity.email !== undefined) {
          userCtx.email = identity.email;
        }
        setSentryUser(userCtx);
      } else {
        clearSentryUser();
      }
    }
    await next();
  });

  if (dependencies.cache) {
    const cache = dependencies.cache;
    app.use("/trpc/auth.*", rateLimitMiddleware("auth", cache));
    app.use("/trpc/search.*", rateLimitMiddleware("search", cache));
    app.use("/trpc/profile.*", rateLimitMiddleware("write", cache));
    app.use("/trpc/ranking.*", rateLimitMiddleware("write", cache));
    app.use("/shelves/*", rateLimitMiddleware("write", cache));
  }

  app.get("/health", (c) =>
    c.json({
      ok: true,
      service: "hone-api"
    })
  );

  app.use(
    "/trpc/*",
    trpcServer({
      router: appRouter,
      createContext: createTrpcContext(dependencies)
    })
  );

  app.post("/shelves/books", async (c) => {
    if (!dependencies.repositories || !dependencies.auth) {
      return c.json({ error: "API dependencies are not configured" }, 503);
    }

    const body = addBookSchema.parse(await c.req.json());
    const services = new AppServices(
      dependencies.repositories,
      dependencies.auth
    );
    const shelfItem = await services.shelves.addBookToShelf(body);

    return c.json({ shelfItem }, 201);
  });

  return app;
}

export type HoneApi = ReturnType<typeof createApi>;

