import { View, Text, FlatList, Image, StyleSheet, TouchableOpacity } from "react-native";
import type { EntityId, ListItem, Book, ShelfAuthorType } from "@hone/domain";

export interface ListViewItem extends ListItem {
  book?: Book;
}

export interface ListViewProps {
  /** List name displayed as the heading. */
  listName: string;
  /** Optional short description shown below the heading. */
  description?: string;
  /**
   * Shelf author type. Drives the provenance badge:
   *   internal_editorial → "Verified"
   *   algorithmic        → "Curated by Hone"
   *   user               → no badge
   */
  authorType: ShelfAuthorType;
  /** Items on the list, in display order. */
  items: ListViewItem[];
  /** Called when the user taps a book row. */
  onItemPress?: (bookId: EntityId) => void;
}

function authorBadgeLabel(authorType: ShelfAuthorType): string | null {
  if (authorType === "internal_editorial") return "Verified";
  if (authorType === "algorithmic") return "Curated by Hone";
  return null;
}

/**
 * Native parity for /u/{handle}/lists/{slug} (#131, N-08).
 * Pure presentational; the parent screen fetches the data and supplies it.
 */
export function ListView({
  listName,
  description,
  authorType,
  items,
  onItemPress,
}: ListViewProps) {
  const badge = authorBadgeLabel(authorType);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headingRow}>
          <Text style={styles.heading} accessibilityRole="header">
            {listName}
          </Text>
          {badge ? (
            <Text style={styles.badge} accessibilityLabel={`${badge} list`}>
              {badge}
            </Text>
          ) : null}
        </View>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
      {items.length === 0 ? (
        <Text style={styles.empty}>No books on this list yet.</Text>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => onItemPress?.(item.bookId)}
              accessibilityRole="button"
              accessibilityLabel={item.book ? item.book.canonicalTitle : item.bookId}
            >
              <Text style={styles.position}>{index + 1}</Text>
              {item.book?.coverUrl ? (
                <Image source={{ uri: item.book.coverUrl }} style={styles.cover} accessibilityLabel="" />
              ) : null}
              <Text style={styles.title}>
                {item.book ? item.book.canonicalTitle : item.bookId}
              </Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F2EA" },
  header: { padding: 18, gap: 6 },
  headingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  heading: { color: "#181512", fontSize: 22, fontWeight: "700" },
  badge: {
    backgroundColor: "#253F5B",
    borderRadius: 4,
    color: "#F7F4ED",
    fontSize: 11,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  description: { color: "#676158", fontSize: 14, lineHeight: 20 },
  empty: { color: "#676158", padding: 18, fontSize: 14 },
  row: {
    alignItems: "center",
    borderBottomColor: "#E5DFD3",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  position: {
    color: "#9B927D",
    fontSize: 14,
    fontVariant: ["tabular-nums"],
    minWidth: 24,
    textAlign: "right",
  },
  cover: { width: 48, height: 72, borderRadius: 4, backgroundColor: "#E5DFD3" },
  title: { color: "#181512", flex: 1, fontSize: 15, fontWeight: "500" },
});
