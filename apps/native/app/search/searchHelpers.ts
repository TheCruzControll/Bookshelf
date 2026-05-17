import type { BookSearchResultInput } from "@hone/domain";

/**
 * Pure helpers shared by the native search components (G-03, #77).
 *
 * Kept in a separate, react-native-free module so unit tests can import
 * them without dragging the RN runtime into the vitest Node environment.
 * The visual components (SearchResultCard, SearchPanel) re-export these
 * so consumers still have one logical import surface.
 */

/**
 * Stable key for a catalog result. Used as React `key` in the results
 * list and as the lookup key for `existingStateByKey`. Catalog results
 * have no internal book id until they are saved, so the source + the
 * source-specific key are the only stable identifier we have.
 */
export function resultKey(r: BookSearchResultInput): string {
  return `${r.source}:${r.sourceKey}`;
}

/**
 * Render a list of authors as a single line:
 *  - 0 authors  → "Unknown author"
 *  - 1 author   → "<name>"
 *  - 2 authors  → "<a> & <b>"
 *  - 3+ authors → "<a>, <b>, +<N-2>"
 *
 * Mirrors the web `formatAuthors` helper inside
 * `apps/web/app/search/SearchResultCard.tsx`.
 */
export function formatAuthors(authors: ReadonlyArray<string>): string {
  if (authors.length === 0) return "Unknown author";
  if (authors.length === 1) return authors[0]!;
  if (authors.length === 2) return `${authors[0]} & ${authors[1]}`;
  return `${authors[0]}, ${authors[1]}, +${authors.length - 2}`;
}
