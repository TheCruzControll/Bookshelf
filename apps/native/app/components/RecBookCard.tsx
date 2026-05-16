import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import type { RecommendationInput } from "@hone/domain";

export interface RecBookCardProps {
  /** The recommendation to render. */
  recommendation: RecommendationInput;
  /** Optional href; defaults to `/books/{book.id}`. */
  href?: string;
  /** Optional press override (otherwise routes to {@link href}). */
  onPress?: () => void;
}

/**
 * One book card rendered inside a Discover grid or Book Detail carousel
 * (P-07, #143). Native parity for `apps/web/app/components/RecBookCard.tsx`.
 * Shows the cover (or a typographic fallback), the title, and a
 * "why this?" reason chip from the server.
 *
 * The reason string is server-supplied. For the cold-start path (#141)
 * the server returns labels like "Popular on Hone" or "An editor's pick";
 * for the main pipeline (#139) labels look like "Popular among your
 * friends" or "Matches your reading taste". The chip renders the string
 * verbatim — the UI does not classify reasons by source.
 */
export function RecBookCard({ recommendation, href, onPress }: RecBookCardProps) {
  const router = useRouter();
  const { book, reason } = recommendation;
  const target = href ?? `/books/${book.id}`;
  const handlePress = () => {
    if (onPress) {
      onPress();
      return;
    }
    router.push(target as never);
  };
  const fallback = book.canonicalTitle.charAt(0).toUpperCase();
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={handlePress}
      accessibilityRole="link"
      accessibilityLabel={`${book.canonicalTitle} — ${reason}`}
    >
      <View style={styles.cover}>
        {book.coverUrl ? (
          <Image
            source={{ uri: book.coverUrl }}
            style={styles.coverImage}
            accessibilityLabel=""
          />
        ) : (
          <Text style={styles.coverFallback}>{fallback}</Text>
        )}
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {book.canonicalTitle}
        </Text>
        <Text style={styles.reasonChip} numberOfLines={2}>
          {reason}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 152,
    gap: 8,
  },
  cover: {
    width: 152,
    height: 220,
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
    fontSize: 48,
    fontWeight: "700",
  },
  body: {
    gap: 6,
  },
  title: {
    color: "#181512",
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 18,
  },
  reasonChip: {
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
    paddingVertical: 4,
  },
});
