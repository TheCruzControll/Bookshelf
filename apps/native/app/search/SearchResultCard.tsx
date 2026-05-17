import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import type { BookSearchResultInput, ReadingStatus } from "@hone/domain";
import { formatAuthors } from "./searchHelpers";

export { formatAuthors };

/**
 * Existing user state for a book the viewer has already saved, surfaced
 * as a chip on the search result card. The catalog procedures (#75) do
 * not yet enrich results with viewer state — this prop is passed by the
 * search panel so the chip renders once a future `viewerBookState`
 * query is wired in. Native parity for the web `ExistingUserState`.
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
   * Press handler used by the parent search panel to open the AddSheet.
   * Optional so the card can be rendered statically in the empty state
   * or in tests.
   */
  onSelect?: (result: BookSearchResultInput) => void;
}

/**
 * One row in the native /search results grid (G-03, #77). Native parity
 * for `apps/web/app/search/SearchResultCard.tsx`.
 *
 * Shows cover (with a typographic fallback when none is available),
 * title, formatted author list, and the first-published year if known.
 * Adds an "existing user state" badge when the viewer already has this
 * book on a shelf.
 *
 * Rendered as a `TouchableOpacity` when an `onSelect` handler is
 * provided so it is press-activatable; degrades to a plain `View` for
 * purely static contexts (tests, empty states).
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
  const formattedAuthors = formatAuthors(result.authors);
  const fallbackLetter = result.title.charAt(0).toUpperCase();

  const accessibilityLabel = `${result.title}${
    result.authors.length > 0 ? ` by ${formattedAuthors}` : ""
  }${statusLabel ? ` — ${statusLabel}` : ""}`;

  const body = (
    <>
      <View style={styles.cover}>
        {result.coverUrl ? (
          <Image
            source={{ uri: result.coverUrl }}
            style={styles.coverImage}
            accessibilityLabel=""
          />
        ) : (
          <Text style={styles.coverFallback} testID="search-result-cover-fallback">
            {fallbackLetter}
          </Text>
        )}
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {result.title}
        </Text>
        <Text style={styles.author} numberOfLines={1}>
          {formattedAuthors}
        </Text>
        {yearLabel ? (
          <Text style={styles.year} testID="search-result-year">
            {yearLabel}
          </Text>
        ) : null}
        {statusLabel ? (
          <Text style={styles.stateBadge} testID="search-result-state-badge">
            {statusLabel}
          </Text>
        ) : null}
      </View>
    </>
  );

  if (onSelect) {
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => onSelect(result)}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        testID="search-result-card"
      >
        {body}
      </TouchableOpacity>
    );
  }
  return (
    <View
      style={styles.card}
      accessibilityLabel={accessibilityLabel}
      testID="search-result-card"
    >
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 10,
  },
  cover: {
    width: 64,
    height: 96,
    backgroundColor: "#E5DFD3",
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  coverImage: {
    width: "100%",
    height: "100%",
  },
  coverFallback: {
    color: "#253F5B",
    fontFamily: "serif",
    fontSize: 28,
    fontWeight: "700",
  },
  body: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: "#181512",
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 19,
  },
  author: {
    color: "#676158",
    fontSize: 13,
    lineHeight: 17,
  },
  year: {
    color: "#9B927D",
    fontSize: 12,
  },
  stateBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#FBFAF6",
    borderColor: "#253F5B",
    borderWidth: 1,
    borderRadius: 999,
    color: "#253F5B",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 4,
  },
});
