import type { BookSearchResultInput } from "@hone/domain";
import { parseSearchQuery } from "./isbnQuery";

/**
 * Server-side fetcher for the /search page (G-02, #76).
 *
 * The web app is currently RSC-only and has no tRPC client wired in
 * (mirrors the Discover page in #142). For an initial server-side render
 * we return an empty list so the page mounts in a known empty state;
 * once a server-side tRPC caller lands, this is the single seam to wire
 * `catalog.search` and `catalog.byIsbn` into.
 *
 * Exported so tests can stub it via module mocking.
 */
export async function fetchSearchResults(
  rawQuery: string,
): Promise<BookSearchResultInput[]> {
  const parsed = parseSearchQuery(rawQuery);
  if (parsed.kind === "empty") return [];
  // TODO(#76 follow-up): when a tRPC client lands, switch on parsed.kind:
  //   - "isbn" → ctx.trpc.catalog.byIsbn.query({ isbn: parsed.isbn })
  //   - "text" → ctx.trpc.catalog.search.query({ query: parsed.query })
  return [];
}
