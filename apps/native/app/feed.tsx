import { useCallback, useState } from "react";
import { SafeAreaView, StyleSheet } from "react-native";
import type { FeedGroupInput } from "@hone/domain";
import { FeedGroupedView } from "./components/FeedGroupedView";

/**
 * Native feed screen (#137, O-06).
 *
 * Mirrors apps/web/app/components/FeedGroupedView.tsx grouping behavior:
 * single-event groups render as a feed item card; multi-event groups
 * render a stacked-covers summary that expands on tap.
 *
 * Data fetching is a parent-supplied seam consistent with the rest of
 * the native surface — the tRPC wiring PR will swap in a real query.
 * For now the component owns a `refreshing` flag so the
 * pull-to-refresh affordance round-trips correctly when wired.
 */
async function fetchFeedGroups(): Promise<FeedGroupInput[]> {
  return [];
}

export default function FeedScreen() {
  const [groups, setGroups] = useState<FeedGroupInput[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const next = await fetchFeedGroups();
      setGroups(next);
    } finally {
      setRefreshing(false);
    }
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <FeedGroupedView
        groups={groups}
        refreshing={refreshing}
        onRefresh={onRefresh}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F4ED" },
});
