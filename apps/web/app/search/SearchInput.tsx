"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createDebouncer } from "./debounce";
import { parseSearchQuery, type ParsedQuery } from "./isbnQuery";

export interface SearchInputProps {
  /** Initial value of the search field. Defaults to the empty string. */
  initialValue?: string;
  /** Placeholder shown while the field is empty. */
  placeholder?: string;
  /**
   * Debounce window (ms) applied to keystrokes before the parsed query is
   * forwarded to {@link onQueryChange}. Defaults to 300ms (matches the
   * spec note in the issue brief).
   */
  debounceMs?: number;
  /**
   * Called with the classified query after the debounce window elapses.
   * Receives `{ kind: "empty" }` when the input is cleared so the parent
   * can clear results.
   */
  onQueryChange: (parsed: ParsedQuery) => void;
}

/**
 * Controlled-by-default search input for the /search surface (G-02, #76).
 *
 * Detects ISBN-10 (10 chars, optional trailing `X`) and ISBN-13 (13 digits)
 * via {@link parseSearchQuery} and forwards the classified result to the
 * parent so it can dispatch to `catalog.byIsbn` vs `catalog.search`. The
 * debounce keeps every keystroke from hitting the network.
 */
export function SearchInput({
  initialValue = "",
  placeholder = "Search by title, author, or ISBN",
  debounceMs = 300,
  onQueryChange,
}: SearchInputProps) {
  const [value, setValue] = useState(initialValue);
  // Hold the latest callback in a ref so the debouncer (created once per
  // mount) always dispatches to the freshest parent handler.
  const callbackRef = useRef(onQueryChange);
  useEffect(() => {
    callbackRef.current = onQueryChange;
  }, [onQueryChange]);

  const debouncer = useMemo(
    () =>
      createDebouncer<string>((raw) => {
        callbackRef.current(parseSearchQuery(raw));
      }, debounceMs),
    [debounceMs],
  );

  // Cancel any in-flight debounce on unmount so unmounted components do
  // not fire stale callbacks.
  useEffect(() => () => debouncer.cancel(), [debouncer]);

  useEffect(() => {
    debouncer.schedule(value);
  }, [value, debouncer]);

  return (
    <div className="searchInput" role="search">
      <label className="searchInputLabel" htmlFor="hone-search-input">
        Search books
      </label>
      <input
        id="hone-search-input"
        type="search"
        className="searchInputField"
        autoComplete="off"
        spellCheck={false}
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        aria-label="Search by title, author, or ISBN"
        data-testid="search-input"
      />
    </div>
  );
}
