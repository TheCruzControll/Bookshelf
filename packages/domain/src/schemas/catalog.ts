import { z } from "zod";

/**
 * Zod schemas for the catalog tRPC procedures (#75):
 *
 *  - `catalog.search`  — title/author keyword search
 *  - `catalog.byIsbn`  — single-book lookup by ISBN-10 or ISBN-13
 *
 * Output shapes mirror the domain `BookSearchResult` (see
 * `packages/domain/src/types.ts`). They are intentionally permissive on
 * optional fields because the upstream providers (Open Library / Google
 * Books) emit overlapping but non-identical metadata.
 */

export const BookSearchResultSourceSchema = z.enum(["open_library", "google_books"]);

export const BookSearchResultSchema = z.object({
  source: BookSearchResultSourceSchema,
  sourceKey: z.string().min(1),
  title: z.string().min(1),
  subtitle: z.string().optional(),
  authors: z.array(z.string()),
  description: z.string().optional(),
  coverUrl: z.string().optional(),
  firstPublishedYear: z.number().int().optional(),
  publisher: z.string().optional(),
  publishedDate: z.string().optional(),
  pageCount: z.number().int().positive().optional(),
  isbn10: z.string().optional(),
  isbn13: z.string().optional(),
  genres: z.array(z.string()).optional(),
  workId: z.string().optional(),
  editionCount: z.number().int().nonnegative().optional(),
  languages: z.array(z.string()).optional(),
});

export const CatalogSearchInputSchema = z.object({
  query: z.string().min(1).max(200),
  limit: z.number().int().positive().max(50).optional(),
});

export const CatalogSearchOutputSchema = z.object({
  results: z.array(BookSearchResultSchema),
});

export const CatalogByIsbnInputSchema = z.object({
  /**
   * ISBN-10 or ISBN-13. Hyphens / spaces are tolerated (the catalog
   * adapter normalizes before lookup); length is bounded loosely here so
   * the client receives a useful validation error if it sends, e.g., a
   * Goodreads numeric id by mistake.
   */
  isbn: z.string().min(10).max(20),
});

export const CatalogByIsbnOutputSchema = z.object({
  result: BookSearchResultSchema.nullable(),
});

export type BookSearchResultSource = z.infer<typeof BookSearchResultSourceSchema>;
export type BookSearchResultInput = z.infer<typeof BookSearchResultSchema>;
export type CatalogSearchInput = z.infer<typeof CatalogSearchInputSchema>;
export type CatalogSearchOutput = z.infer<typeof CatalogSearchOutputSchema>;
export type CatalogByIsbnInput = z.infer<typeof CatalogByIsbnInputSchema>;
export type CatalogByIsbnOutput = z.infer<typeof CatalogByIsbnOutputSchema>;
