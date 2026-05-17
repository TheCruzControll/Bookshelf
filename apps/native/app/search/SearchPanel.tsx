import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { BookSearchResultInput } from "@hone/domain";
import {
  AddSheet,
  type AddSheetSubmission,
  type ShelfOption,
} from "./AddSheet";
import { SearchInput } from "./SearchInput";
import {
  SearchResultCard,
  type ExistingUserState,
} from "./SearchResultCard";
import type { ParsedQuery } from "./isbnQuery";
import { resultKey } from "./searchHelpers";

export { resultKey };

/**
 * Pluggable search backend so the screen can pass a fetcher shim today
 * and switch to a tRPC client when one lands without changing the panel.
 * Native parity for `apps/web/app/search/SearchPanel.tsx`.
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

const NOOP_BACKEND: SearchBackend = {
  async searchByText() {
    return [];
  },
  async lookupByIsbn() {
    return null;
  },
};

/**
 * Stateful native wrapper around SearchInput + the result list +
 * AddSheet (G-03, #77). Native parity for the web SearchPanel.
 *
 * The /search screen renders this once with an initial set of results
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
    <View style={styles.panel} testID="search-panel">
      <SearchInput onQueryChange={handleQueryChange} />
      {loadingError ? (
        <Text style={styles.error} accessibilityRole="alert">
          {loadingError}
        </Text>
      ) : null}
      <View
        style={styles.results}
        accessibilityLabel="Search results"
        testID="search-results-list"
      >
        {results.length === 0 ? (
          <Text style={styles.empty}>
            Search by title, author, or ISBN. Can&rsquo;t find your book?
            You&rsquo;ll be able to add it manually once you have one
            result selected.
          </Text>
        ) : (
          results.map((r) => {
            const key = resultKey(r);
            const state = existingStateByKey?.[key] ?? { status: null };
            return (
              <SearchResultCard
                key={key}
                result={r}
                existingState={state}
                onSelect={handleSelect}
              />
            );
          })
        )}
      </View>
      {selected ? (
        <AddSheet
          visible
          book={selected}
          shelves={shelves}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: 14,
  },
  error: {
    color: "#B9472D",
    fontSize: 13,
    lineHeight: 18,
  },
  results: {
    gap: 4,
  },
  empty: {
    color: "#676158",
    fontSize: 14,
    lineHeight: 20,
  },
});

// Re-exported so consumers (and tests) can build a stable key the same way.
export const __testing = { resultKey };

// Re-export the type so the screen can construct an `existingStateByKey`
// map without importing `BookSearchResultInput` directly.
export type SearchResultKey = `${BookSearchResultInput["source"]}:${string}`;
