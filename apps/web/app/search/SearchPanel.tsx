"use client";

import { useCallback, useState } from "react";
import type { BookSearchResultInput } from "@hone/domain";
import { AddSheet, type AddSheetSubmission, type ShelfOption } from "./AddSheet";
import { SearchInput } from "./SearchInput";
import {
  SearchResultCard,
  type ExistingUserState,
} from "./SearchResultCard";
import type { ParsedQuery } from "./isbnQuery";

/**
 * Pluggable search backend so the page (RSC) can pass a server-action
 * shim today and switch to a tRPC client when one lands without changing
 * the panel.
 */
export interface SearchBackend {
  searchByText(query: string): Promise<BookSearchResultInput[]>;
  lookupByIsbn(isbn: string): Promise<BookSearchResultInput | null>;
  /**
   * Optional: returns the viewer's existing state for a stable book key.
   * If omitted, every card renders with `{ status: null }`. Keyed by
   * `${source}:${sourceKey}` because catalog results have no internal
   * book id until they are saved.
   */
  loadExistingState?(
    keys: ReadonlyArray<string>,
  ): Promise<Record<string, ExistingUserState>>;
  /** Optional save callback. If omitted, the save button is a no-op. */
  saveBook?(args: {
    book: BookSearchResultInput;
    submission: AddSheetSubmission;
  }): Promise<void>;
}

export interface SearchPanelProps {
  /** Initial results to render before the viewer types anything. */
  initialResults?: ReadonlyArray<BookSearchResultInput>;
  /** Viewer's shelves used by the AddSheet picker. */
  shelves: ReadonlyArray<ShelfOption>;
  /** Pre-computed existing-state map keyed by `${source}:${sourceKey}`. */
  existingStateByKey?: Readonly<Record<string, ExistingUserState>>;
  /** Backend bound to the eventual tRPC client; defaults to a no-op. */
  backend?: SearchBackend;
}

function resultKey(r: BookSearchResultInput): string {
  return `${r.source}:${r.sourceKey}`;
}

const NOOP_BACKEND: SearchBackend = {
  async searchByText() {
    return [];
  },
  async lookupByIsbn() {
    return null;
  },
};

/**
 * Stateful client wrapper around SearchInput + the result grid + AddSheet.
 *
 * The /search page (RSC) renders this once with an initial set of results
 * (currently empty — no tRPC client yet), the viewer's shelves, and a
 * `backend` shim. The panel owns:
 *  - the active query → results pipeline
 *  - selecting a result to open the AddSheet
 *  - submitting / cancelling the AddSheet
 */
export function SearchPanel({
  initialResults = [],
  shelves,
  existingStateByKey,
  backend = NOOP_BACKEND,
}: SearchPanelProps) {
  const [results, setResults] = useState<ReadonlyArray<BookSearchResultInput>>(
    initialResults,
  );
  const [selected, setSelected] = useState<BookSearchResultInput | null>(null);
  const [loadingError, setLoadingError] = useState<string | null>(null);

  const handleQueryChange = useCallback(
    async (parsed: ParsedQuery) => {
      setLoadingError(null);
      if (parsed.kind === "empty") {
        setResults([]);
        return;
      }
      try {
        if (parsed.kind === "isbn") {
          const r = await backend.lookupByIsbn(parsed.isbn);
          setResults(r ? [r] : []);
        } else {
          const list = await backend.searchByText(parsed.query);
          setResults(list);
        }
      } catch {
        setResults([]);
        setLoadingError("Couldn't reach the catalog. Try again in a moment.");
      }
    },
    [backend],
  );

  const handleSelect = useCallback((book: BookSearchResultInput) => {
    setSelected(book);
  }, []);

  const handleCancel = useCallback(() => {
    setSelected(null);
  }, []);

  const handleSubmit = useCallback(
    async (submission: AddSheetSubmission) => {
      if (!selected) return;
      if (backend.saveBook) {
        await backend.saveBook({ book: selected, submission });
      }
      setSelected(null);
    },
    [backend, selected],
  );

  return (
    <div className="searchPanel" data-testid="search-panel">
      <SearchInput onQueryChange={handleQueryChange} />
      {loadingError ? (
        <p className="searchPanelError" role="alert">
          {loadingError}
        </p>
      ) : null}
      <ul
        className="searchResultsList"
        role="list"
        data-testid="search-results-list"
      >
        {results.length === 0 ? (
          <li className="searchResultsEmpty">
            <p>
              Search by title, author, or ISBN. Can&rsquo;t find your book?
              You&rsquo;ll be able to add it manually once you have one
              result selected.
            </p>
          </li>
        ) : (
          results.map((r) => {
            const key = resultKey(r);
            const state = existingStateByKey?.[key] ?? { status: null };
            return (
              <li key={key} className="searchResultsItem">
                <SearchResultCard
                  result={r}
                  existingState={state}
                  onSelect={handleSelect}
                />
              </li>
            );
          })
        )}
      </ul>
      {selected ? (
        <AddSheet
          book={selected}
          shelves={shelves}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
        />
      ) : null}
    </div>
  );
}

// Re-exported so consumers (and tests) can build a stable key the same way.
export const __testing = { resultKey };

// Re-export the type so the page can construct an `existingStateByKey` map
// without importing `BookSearchResultInput` directly into the RSC entry.
export type SearchResultKey = `${BookSearchResultInput["source"]}:${string}`;
