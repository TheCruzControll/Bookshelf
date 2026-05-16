import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import type { RecommendationInput } from "@hone/domain";
import { Nav } from "../../components/Nav";
import { RecCarousel } from "../../components/RecCarousel";
import { fetchBookDetailRecommendations } from "./fetchBookDetailRecommendations";

/**
 * Native Book Detail screen (P-07, #143).
 *
 * Mirrors `apps/web/app/books/[id]/page.tsx`. Surfaces a hero header
 * plus the "You might also like" rail. The carousel renders 6-10
 * recommendations with verbatim reason chips from #139/#141.
 *
 * The fetcher is currently a stub (`[]`) since the native tRPC client
 * is not yet wired — same deferred approach as the web build in #142.
 */
export default function BookDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = params.id ?? "";
  const [recommendations, setRecommendations] = useState<RecommendationInput[]>(
    [],
  );

  useEffect(() => {
    let cancelled = false;
    if (!id) return;
    fetchBookDetailRecommendations(id).then((recs) => {
      if (!cancelled) setRecommendations(recs);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <View style={styles.container}>
      <Nav currentPath="/books" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>Book Detail</Text>
          <Text style={styles.title} accessibilityRole="header">
            {id || "Book"}
          </Text>
        </View>
        <RecCarousel recommendations={recommendations} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F4ED" },
  content: { paddingVertical: 18, paddingBottom: 48, gap: 12 },
  hero: { paddingHorizontal: 18, gap: 8 },
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
    fontSize: 24,
    fontWeight: "600",
    lineHeight: 30,
  },
});
