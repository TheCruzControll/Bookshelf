import { useCallback, useState } from "react";
import { View, Text, TouchableOpacity, Image, StyleSheet } from "react-native";

export interface ComparisonBook {
  id: string;
  title: string;
  author: string;
  coverUrl?: string;
  excerpt?: string;
  score?: number;
}

export interface RankingComparisonModalProps {
  newBook: ComparisonBook;
  existingBook: ComparisonBook;
  scoresUnlocked: boolean;
  onPick: (choice: "new" | "existing") => Promise<void> | void;
}

/**
 * Native ranking flow step 2 (#116, L-08) — mirrors the web
 * RankingComparisonModal. The existing book's score is shown only
 * when scoresUnlocked is true; the new book never shows a score.
 */
export function RankingComparisonModal({
  newBook,
  existingBook,
  scoresUnlocked,
  onPick,
}: RankingComparisonModalProps) {
  const [pending, setPending] = useState(false);

  const pick = useCallback(
    async (choice: "new" | "existing") => {
      if (pending) return;
      setPending(true);
      try {
        await onPick(choice);
      } finally {
        setPending(false);
      }
    },
    [pending, onPick],
  );

  return (
    <View style={styles.modal} accessibilityLabel="Compare books">
      <Text style={styles.title}>Which is more your taste?</Text>
      <View style={styles.pair}>
        <TouchableOpacity
          style={styles.card}
          onPress={() => pick("new")}
          disabled={pending}
          accessibilityRole="button"
          accessibilityLabel={`Pick ${newBook.title}`}
        >
          {newBook.coverUrl ? (
            <Image source={{ uri: newBook.coverUrl }} style={styles.cover} accessibilityLabel="" />
          ) : null}
          <Text style={styles.bookTitle}>{newBook.title}</Text>
          <Text style={styles.author}>{newBook.author}</Text>
          {newBook.excerpt ? <Text style={styles.excerpt}>{newBook.excerpt}</Text> : null}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={() => pick("existing")}
          disabled={pending}
          accessibilityRole="button"
          accessibilityLabel={`Pick ${existingBook.title}`}
        >
          {existingBook.coverUrl ? (
            <Image source={{ uri: existingBook.coverUrl }} style={styles.cover} accessibilityLabel="" />
          ) : null}
          <Text style={styles.bookTitle}>{existingBook.title}</Text>
          <Text style={styles.author}>{existingBook.author}</Text>
          {existingBook.excerpt ? <Text style={styles.excerpt}>{existingBook.excerpt}</Text> : null}
          {scoresUnlocked && typeof existingBook.score === "number" ? (
            <Text style={styles.score} accessibilityLabel="Score">
              {existingBook.score.toFixed(2)}
            </Text>
          ) : null}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  modal: { backgroundColor: "#FBFAF6", borderRadius: 12, gap: 16, padding: 20 },
  title: { color: "#181512", fontSize: 18, fontWeight: "700", textAlign: "center" },
  pair: { flexDirection: "row", gap: 12 },
  card: {
    alignItems: "center",
    borderColor: "#E5DFD3",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    gap: 6,
    padding: 12,
  },
  cover: { backgroundColor: "#E5DFD3", borderRadius: 4, height: 144, width: 96 },
  bookTitle: { color: "#181512", fontSize: 15, fontWeight: "600", textAlign: "center" },
  author: { color: "#676158", fontSize: 12, textAlign: "center" },
  excerpt: { color: "#676158", fontSize: 12, fontStyle: "italic", textAlign: "center" },
  score: { color: "#253F5B", fontSize: 16, fontVariant: ["tabular-nums"], fontWeight: "700" },
});
