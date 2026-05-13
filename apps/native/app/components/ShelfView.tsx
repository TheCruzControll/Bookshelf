import { View, Text, FlatList, Image, StyleSheet, TouchableOpacity } from "react-native";
import type { EntityId, ShelfItem, Book } from "@hone/domain";

export interface ShelfViewItem extends ShelfItem {
  book?: Book;
}

export interface ShelfViewProps {
  /** Shelf name to display as the screen heading. */
  shelfName: string;
  /** Optional short description shown below the heading. */
  description?: string;
  /** Books on the shelf. Renders as a FlatList; an empty array shows the empty state. */
  items: ShelfViewItem[];
  /** Called when the user taps a book row. The parent navigates to /books/{id}. */
  onItemPress?: (bookId: EntityId) => void;
}

/**
 * Native parity for /u/{handle}/shelves/{slug} (#131, N-08).
 * Pure presentational; the parent screen fetches the data and supplies it.
 */
export function ShelfView({ shelfName, description, items, onItemPress }: ShelfViewProps) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.heading} accessibilityRole="header">
          {shelfName}
        </Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
      {items.length === 0 ? (
        <Text style={styles.empty}>No books on this shelf yet.</Text>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => onItemPress?.(item.bookId)}
              accessibilityRole="button"
              accessibilityLabel={item.book ? item.book.canonicalTitle : item.bookId}
            >
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
  heading: { color: "#181512", fontSize: 22, fontWeight: "700" },
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
  cover: { width: 48, height: 72, borderRadius: 4, backgroundColor: "#E5DFD3" },
  title: { color: "#181512", flex: 1, fontSize: 15, fontWeight: "500" },
});
