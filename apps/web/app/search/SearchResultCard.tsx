import type { BookSearchResultInput } from "@hone/domain";
import type { ReadingStatus } from "@hone/domain";

/**
 * Existing user state for a book the viewer has already saved, surfaced as
 * a chip on the search result card. The catalog procedures (#75) do not
 * yet enrich results with viewer state — this prop is passed by the
 * search panel so the chip renders once a future `viewerBookState` query
 * is wired in (see PR description).
 */
export type ExistingUserState =
  | { status: ReadingStatus }
  | { status: null };

const STATUS_LABEL: Record<ReadingStatus, string> = {
  want_to_read: "Want to read",
  reading: "Reading",
  finished: "Finished",
  dropped: "Dropped",
};

export interface SearchResultCardProps {
  /** Catalog-side metadata for the book. */
  result: BookSearchResultInput;
  /**
   * Existing viewer state for this book. Pass `{ status: null }` when the
   * viewer has not saved it. Defaults to `{ status: null }`.
   */
  existingState?: ExistingUserState;
  /**
   * Click handler used by the parent search panel to open the AddSheet.
   * Optional so the card can be rendered statically in the empty state
   * or in tests.
   */
  onSelect?: (result: BookSearchResultInput) => void;
}

function formatAuthors(authors: ReadonlyArray<string>): string {
  if (authors.length === 0) return "Unknown author";
  if (authors.length === 1) return authors[0]!;
  if (authors.length === 2) return `${authors[0]} & ${authors[1]}`;
  return `${authors[0]}, ${authors[1]}, +${authors.length - 2}`;
}

/**
 * One row in the /search results grid (G-02, #76).
 *
 * Shows cover (with a typographic fallback when none is available),
 * title, formatted author list, and the first-published year if known.
 * Adds an "existing user state" badge when the viewer already has this
 * book on a shelf.
 *
 * Rendered as a `<button>` when an `onSelect` handler is provided so it
 * is keyboard-activatable; degrades to a `<div>` for purely static
 * contexts (tests, empty states).
 */
export function SearchResultCard({
  result,
  existingState = { status: null },
  onSelect,
}: SearchResultCardProps) {
  const yearLabel = result.firstPublishedYear
    ? String(result.firstPublishedYear)
    : null;
  const statusLabel =
    existingState.status !== null ? STATUS_LABEL[existingState.status] : null;

  const body = (
    <>
      <span className="searchResultCardCover" aria-hidden="true">
        {result.coverUrl ? (
          <img src={result.coverUrl} alt="" />
        ) : (
          <span className="searchResultCardCoverFallback">
            {result.title.charAt(0).toUpperCase()}
          </span>
        )}
      </span>
      <span className="searchResultCardBody">
        <strong className="searchResultCardTitle">{result.title}</strong>
        <span className="searchResultCardAuthor">
          {formatAuthors(result.authors)}
        </span>
        {yearLabel ? (
          <span
            className="searchResultCardYear"
            data-testid="search-result-year"
          >
            {yearLabel}
          </span>
        ) : null}
        {statusLabel ? (
          <span
            className="searchResultCardStateBadge"
            data-testid="search-result-state-badge"
          >
            {statusLabel}
          </span>
        ) : null}
      </span>
    </>
  );

  const ariaLabel = `${result.title}${
    result.authors.length > 0 ? ` by ${formatAuthors(result.authors)}` : ""
  }${statusLabel ? ` — ${statusLabel}` : ""}`;

  if (onSelect) {
    return (
      <button
        type="button"
        className="searchResultCard"
        onClick={() => onSelect(result)}
        aria-label={ariaLabel}
        data-testid="search-result-card"
      >
        {body}
      </button>
    );
  }
  return (
    <div
      className="searchResultCard"
      aria-label={ariaLabel}
      data-testid="search-result-card"
    >
      {body}
    </div>
  );
}
