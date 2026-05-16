import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { RecommendationInput } from "@hone/domain";
import { Nav } from "../components/Nav";
import { RecBookCard } from "../components/RecBookCard";
import { fetchDiscoverRecommendations } from "./fetchDiscoverRecommendations";

/**
 * Native Discover screen (P-07, #143).
 *
 * Mirrors `apps/web/app/discover/page.tsx`: a hero block + a grid of
 * `RecBookCard`s. Each card carries a reason chip rendered verbatim
 * from the server (either the main pipeline labels from #139 or the
 * cold-start labels from #141).
 *
 * The fetcher is currently a stub (`[]`) since the native tRPC client
 * is not yet wired — same deferred approach as the web build in #142.
 * Wiring lives in a follow-up; this screen's contract will not change.
 */
export default function DiscoverScreen() {
  const [recommendations, setRecommendations] = useState<RecommendationInput[]>(
    [],
  );

  useEffect(() => {
    let cancelled = false;
    fetchDiscoverRecommendations().then((recs) => {
      if (!cancelled) setRecommendations(recs);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View style={styles.container}>
      <Nav currentPath="/discover" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>Discover</Text>
          <Text style={styles.title} accessibilityRole="header">
            Books picked for your taste.
          </Text>
          <Text style={styles.lede}>
            Recommendations from the readers you follow, with a clear
            &ldquo;why this?&rdquo; on every pick.
          </Text>
        </View>
        <View style={styles.grid} accessibilityLabel="Recommended books">
          {recommendations.length === 0 ? (
            <Text style={styles.empty}>
              Finish a few books to seed your taste profile, then check back
              for personalized picks.
            </Text>
          ) : (
            <View style={styles.list}>
              {recommendations.map((rec) => (
                <View key={rec.book.id} style={styles.item}>
                  <RecBookCard recommendation={rec} />
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F4ED" },
  content: { padding: 18, gap: 24, paddingBottom: 48 },
  hero: { gap: 10, paddingTop: 12 },
  eyebrow: {
    color: "#253F5B",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.8,
    textTransform: "uppercase",
  },
  title: {
    color: "#171411",
    fontFamily: "serif",
    fontSize: 28,
    fontWeight: "600",
    lineHeight: 34,
  },
  lede: {
    color: "#676158",
    fontSize: 15,
    lineHeight: 22,
  },
  grid: {
    gap: 16,
  },
  list: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },
  item: {
    width: 152,
  },
  empty: {
    color: "#676158",
    fontSize: 14,
    lineHeight: 20,
  },
});
