import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { trpcServer } from "@hono/trpc-server";
import { createTrpcContext } from "./context";
import { router } from "./trpc";
import { catalogRouter } from "./catalog";
import type { BookSearchResult, CatalogProvider } from "@hone/domain";

vi.mock("@hone/observability", () => ({
  captureException: vi.fn(),
  createLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn() })),
  initSentry: vi.fn(),
  setSentryUser: vi.fn(),
  clearSentryUser: vi.fn(),
}));

function makeResult(overrides?: Partial<BookSearchResult>): BookSearchResult {
  return {
    source: "open_library",
    sourceKey: "OL12345W",
    title: "The Great Gatsby",
    authors: ["F. Scott Fitzgerald"],
    ...overrides,
  };
}

function buildApp(catalogProvider: CatalogProvider) {
  const testRouter = router({ catalog: catalogRouter });
  const app = new Hono();
  app.use(
    "/trpc/*",
    trpcServer({
      router: testRouter,
      createContext: createTrpcContext({ catalogProvider }),
    })
  );
  return app;
}

describe("catalog.search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns merged catalog results from the provider", async () => {
    const results = [
      makeResult({ sourceKey: "OL1", title: "Gatsby Vol I" }),
      makeResult({ sourceKey: "OL2", title: "Gatsby Vol II" }),
    ];
    const provider: CatalogProvider = {
      search: vi.fn().mockResolvedValue(results),
      lookupByIsbn: vi.fn(),
    };
    const app = buildApp(provider);

    const res = await app.request(
      `/trpc/catalog.search?input=${encodeURIComponent(JSON.stringify({ query: "gatsby" }))}`
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.results).toHaveLength(2);
    expect(body.result.data.results[0].title).toBe("Gatsby Vol I");
  });

  it("uses the supplied limit when provided", async () => {
    const provider: CatalogProvider = {
      search: vi.fn().mockResolvedValue([]),
      lookupByIsbn: vi.fn(),
    };
    const app = buildApp(provider);

    await app.request(
      `/trpc/catalog.search?input=${encodeURIComponent(JSON.stringify({ query: "gatsby", limit: 5 }))}`
    );

    expect(provider.search).toHaveBeenCalledWith("gatsby", 5, undefined);
  });

  it("falls back to the default limit when the client omits it", async () => {
    const provider: CatalogProvider = {
      search: vi.fn().mockResolvedValue([]),
      lookupByIsbn: vi.fn(),
    };
    const app = buildApp(provider);

    await app.request(
      `/trpc/catalog.search?input=${encodeURIComponent(JSON.stringify({ query: "gatsby" }))}`
    );

    expect(provider.search).toHaveBeenCalledWith("gatsby", 20, undefined);
  });

  it("forwards the viewer's locale from Accept-Language to the provider", async () => {
    const provider: CatalogProvider = {
      search: vi.fn().mockResolvedValue([]),
      lookupByIsbn: vi.fn(),
    };
    const app = buildApp(provider);

    await app.request(
      `/trpc/catalog.search?input=${encodeURIComponent(JSON.stringify({ query: "gatsby" }))}`,
      { headers: { "accept-language": "fr-FR" } }
    );

    expect(provider.search).toHaveBeenCalledWith("gatsby", 20, "fr-FR");
  });

  it("returns an empty array when the provider yields no matches", async () => {
    const provider: CatalogProvider = {
      search: vi.fn().mockResolvedValue([]),
      lookupByIsbn: vi.fn(),
    };
    const app = buildApp(provider);

    const res = await app.request(
      `/trpc/catalog.search?input=${encodeURIComponent(JSON.stringify({ query: "no-results" }))}`
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.results).toEqual([]);
  });

  it("rejects an empty query string with 400", async () => {
    const provider: CatalogProvider = {
      search: vi.fn(),
      lookupByIsbn: vi.fn(),
    };
    const app = buildApp(provider);

    const res = await app.request(
      `/trpc/catalog.search?input=${encodeURIComponent(JSON.stringify({ query: "" }))}`
    );

    expect(res.status).toBe(400);
    expect(provider.search).not.toHaveBeenCalled();
  });

  it("rejects a limit exceeding the cap with 400", async () => {
    const provider: CatalogProvider = {
      search: vi.fn(),
      lookupByIsbn: vi.fn(),
    };
    const app = buildApp(provider);

    const res = await app.request(
      `/trpc/catalog.search?input=${encodeURIComponent(JSON.stringify({ query: "gatsby", limit: 999 }))}`
    );

    expect(res.status).toBe(400);
    expect(provider.search).not.toHaveBeenCalled();
  });

  it("returns 500 when the catalog provider is not configured", async () => {
    const testRouter = router({ catalog: catalogRouter });
    const app = new Hono();
    app.use(
      "/trpc/*",
      trpcServer({
        router: testRouter,
        createContext: createTrpcContext({}),
      })
    );

    const res = await app.request(
      `/trpc/catalog.search?input=${encodeURIComponent(JSON.stringify({ query: "gatsby" }))}`
    );

    expect(res.status).toBe(500);
  });
});

describe("catalog.byIsbn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the resolved book when the provider finds a match", async () => {
    const result = makeResult({ isbn13: "9780743273565", sourceKey: "OL_GATSBY" });
    const provider: CatalogProvider = {
      search: vi.fn(),
      lookupByIsbn: vi.fn().mockResolvedValue(result),
    };
    const app = buildApp(provider);

    const res = await app.request(
      `/trpc/catalog.byIsbn?input=${encodeURIComponent(JSON.stringify({ isbn: "9780743273565" }))}`
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.result.isbn13).toBe("9780743273565");
    expect(provider.lookupByIsbn).toHaveBeenCalledWith("9780743273565");
  });

  it("returns null when the provider has no match", async () => {
    const provider: CatalogProvider = {
      search: vi.fn(),
      lookupByIsbn: vi.fn().mockResolvedValue(null),
    };
    const app = buildApp(provider);

    const res = await app.request(
      `/trpc/catalog.byIsbn?input=${encodeURIComponent(JSON.stringify({ isbn: "9780000000002" }))}`
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.result).toBeNull();
  });

  it("forwards an ISBN-10 unchanged to the provider (provider normalizes)", async () => {
    const provider: CatalogProvider = {
      search: vi.fn(),
      lookupByIsbn: vi.fn().mockResolvedValue(null),
    };
    const app = buildApp(provider);

    await app.request(
      `/trpc/catalog.byIsbn?input=${encodeURIComponent(JSON.stringify({ isbn: "0743273567" }))}`
    );

    expect(provider.lookupByIsbn).toHaveBeenCalledWith("0743273567");
  });

  it("rejects an ISBN shorter than 10 characters with 400", async () => {
    const provider: CatalogProvider = {
      search: vi.fn(),
      lookupByIsbn: vi.fn(),
    };
    const app = buildApp(provider);

    const res = await app.request(
      `/trpc/catalog.byIsbn?input=${encodeURIComponent(JSON.stringify({ isbn: "123" }))}`
    );

    expect(res.status).toBe(400);
    expect(provider.lookupByIsbn).not.toHaveBeenCalled();
  });

  it("returns 500 when the catalog provider is not configured", async () => {
    const testRouter = router({ catalog: catalogRouter });
    const app = new Hono();
    app.use(
      "/trpc/*",
      trpcServer({
        router: testRouter,
        createContext: createTrpcContext({}),
      })
    );

    const res = await app.request(
      `/trpc/catalog.byIsbn?input=${encodeURIComponent(JSON.stringify({ isbn: "9780743273565" }))}`
    );

    expect(res.status).toBe(500);
  });
});
