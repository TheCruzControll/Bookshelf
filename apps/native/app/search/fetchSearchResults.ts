import type { BookSearchResultInput } from "@hone/domain";
import { parseSearchQuery } from "./isbnQuery";

/**
 * Server-side fetcher for the native /search screen (G-03, #77).
 *
 * The native app currently has no tRPC client wired in (mirrors the
 * Discover screen in #143 and the web build in #142). For an initial
 * render we return an empty list so the screen mounts in a known empty
 * state; once a native tRPC caller lands, this is the single seam to
 * wire `catalog.search` and `catalog.byIsbn` into.
 *
 * Mirrors `apps/web/app/search/fetchSearchResults.ts`. Exported so tests
 * can stub it via module mocking.
 */
export async function fetchSearchResults(
  rawQuery: string,
): Promise<BookSearchResultInput[]> {
  const parsed = parseSearchQuery(rawQuery);
  if (parsed.kind === "empty") return [];
  // TODO(#77 follow-up): when a native tRPC client lands, switch on parsed.kind:
  //   - "isbn" → ctx.trpc.catalog.byIsbn.query({ isbn: parsed.isbn })
  //   - "text" → ctx.trpc.catalog.search.query({ query: parsed.query })
  return [];
}
