import { Hono } from "hono";
import { z } from "zod";
import type { AppRepositories, AuthProvider } from "@bookshelf/domain";
import { AppServices } from "@bookshelf/domain";

export interface ApiDependencies {
  repositories?: AppRepositories;
  auth?: AuthProvider;
}

const addBookSchema = z.object({
  ownerId: z.string().uuid(),
  shelfId: z.string().uuid(),
  bookId: z.string().uuid(),
  editionId: z.string().uuid().optional()
});

export function createApi(dependencies: ApiDependencies = {}) {
  const app = new Hono();

  app.get("/health", (c) =>
    c.json({
      ok: true,
      service: "bookshelf-api"
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

export type BookshelfApi = ReturnType<typeof createApi>;

