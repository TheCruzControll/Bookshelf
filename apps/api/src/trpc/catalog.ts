import { TRPCError } from "@trpc/server";
import {
  CatalogByIsbnInputSchema,
  CatalogByIsbnOutputSchema,
  CatalogSearchInputSchema,
  CatalogSearchOutputSchema,
} from "@hone/domain";
import type { CatalogProvider } from "@hone/domain";
import { router, publicProcedure } from "./trpc";

/** Default cap on result count when the client doesn't supply one. */
const DEFAULT_SEARCH_LIMIT = 20;

/**
 * The composite `CatalogService` from `@hone/catalog` accepts an extra
 * locale argument on `.search` that the bare `CatalogProvider` port does
 * not expose. We narrow to that shape at the call site so we can pass the
 * viewer's locale without polluting the port contract (which adapter
 * implementations don't need to know about).
 */
type CatalogProviderWithLocale = CatalogProvider & {
  search(query: string, limit: number, viewerLocale?: string): Promise<Awaited<ReturnType<CatalogProvider["search"]>>>;
};

/**
 * tRPC procedures backing search, scan, and manual entry surfaces (#75).
 *
 * `catalog.search` and `catalog.byIsbn` are pure catalog reads — they do
 * NOT return user-owned content, so no visibility filter is applied. The
 * AC's "honors visibility filter for any user-content lookups" caveat
 * applies only if a future enrichment surfaces viewer-state alongside the
 * catalog results.
 */
export const catalogRouter = router({
  search: publicProcedure
    .input(CatalogSearchInputSchema)
    .output(CatalogSearchOutputSchema)
    .query(async ({ input, ctx }) => {
      if (!ctx.catalogProvider) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Catalog provider not configured",
        });
      }
      const limit = input.limit ?? DEFAULT_SEARCH_LIMIT;
      const provider = ctx.catalogProvider as CatalogProviderWithLocale;
      const results = await provider.search(input.query, limit, ctx.locale);
      return { results };
    }),

  byIsbn: publicProcedure
    .input(CatalogByIsbnInputSchema)
    .output(CatalogByIsbnOutputSchema)
    .query(async ({ input, ctx }) => {
      if (!ctx.catalogProvider) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Catalog provider not configured",
        });
      }
      const result = await ctx.catalogProvider.lookupByIsbn(input.isbn);
      return { result };
    }),
});
