import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { RecommendationInput } from "@hone/domain";
import { RecBookCard } from "./RecBookCard";

export interface RecCarouselProps {
  /** Recommendations to render in the horizontal scroller. */
  recommendations: ReadonlyArray<RecommendationInput>;
  /** Heading shown above the rail. Defaults to "You might also like". */
  heading?: string;
  /** Optional empty-state copy; rendered when `recommendations` is empty. */
  emptyMessage?: string;
}

/**
 * Horizontal "you might also like" rail (P-07, #143).
 *
 * Native parity for `apps/web/app/components/RecCarousel.tsx`.
 * Used on the Book Detail surface to render 6-10 server-supplied
 * recommendations as a horizontal scroller. Each card shows a reason
 * chip; the data is fetched server-side from
 * `recommendations.forBookDetail` and passed in as a prop.
 */
export function RecCarousel({
  recommendations,
  heading = "You might also like",
  emptyMessage = "No recommendations yet — finish a few books to seed your taste profile.",
}: RecCarouselProps) {
  return (
    <View style={styles.section} accessibilityLabel={heading}>
      <View style={styles.header}>
        <Text style={styles.heading} accessibilityRole="header">
          {heading}
        </Text>
      </View>
      {recommendations.length === 0 ? (
        <Text style={styles.empty}>{emptyMessage}</Text>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.list}
        >
          {recommendations.map((rec) => (
            <View key={rec.book.id} style={styles.item}>
              <RecBookCard recommendation={rec} />
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingVertical: 16,
    gap: 12,
  },
  header: {
    paddingHorizontal: 18,
  },
  heading: {
    color: "#181512",
    fontSize: 18,
    fontWeight: "700",
  },
  list: {
    flexDirection: "row",
    gap: 16,
    paddingHorizontal: 18,
    paddingVertical: 4,
  },
  item: {
    width: 152,
  },
  empty: {
    color: "#676158",
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 18,
  },
});
