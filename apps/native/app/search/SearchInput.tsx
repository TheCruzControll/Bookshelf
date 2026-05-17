import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
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
 * Controlled-by-default React Native search input for the native /search
 * surface (G-03, #77). Native parity for `apps/web/app/search/SearchInput.tsx`.
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
    <View style={styles.container} accessibilityRole="search">
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={setValue}
        placeholder={placeholder}
        placeholderTextColor="#9B927D"
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="Search by title, author, or ISBN"
        testID="search-input"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  input: {
    backgroundColor: "#FBFAF6",
    borderColor: "#E5DFD3",
    borderRadius: 6,
    borderWidth: 1,
    color: "#181512",
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
});
