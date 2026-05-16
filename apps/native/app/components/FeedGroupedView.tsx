import { useCallback, useState } from "react";
import {
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import type { FeedGroupInput, FeedItemInput } from "@hone/domain";
import {
  groupNoun,
  summarizeGroup,
  verbToSummaryText,
} from "./feedGrouping";

export { groupNoun, summarizeGroup, verbToSummaryText };

export interface FeedGroupedViewProps {
  /** Pre-grouped feed groups (newest first), typically from `feed.list` tRPC query. */
  groups: FeedGroupInput[];
  /** Optional empty-state message override. */
  emptyMessage?: string;
  /** Whether a refresh is currently in flight. */
  refreshing?: boolean;
  /** Called when the user pulls down to refresh. */
  onRefresh?: () => void;
}

export interface FeedGroupCardProps {
  group: FeedGroupInput;
}

/** Render a single feed item row inside an expanded group or as a stand-alone card. */
function FeedItemRow({ item }: { item: FeedItemInput }) {
  const actor = item.actor.displayName;
  const verb = verbToSummaryText(item.event.verb);
  const title = item.book?.canonicalTitle ?? item.shelf?.name ?? "";
  const score =
    typeof item.event.scoreAtPublish === "number"
      ? item.event.scoreAtPublish.toFixed(2)
      : null;
  return (
    <View
      style={styles.feedItem}
      accessibilityLabel={`${actor} ${verb} ${title}`.trim()}
    >
      <View style={styles.feedTextGroup}>
        <Text style={styles.feedName}>{actor}</Text>
        <Text style={styles.feedAction}>{verb}</Text>
        <Text style={styles.feedBook}>{title}</Text>
      </View>
      {score ? <Text style={styles.feedScore}>{score}</Text> : null}
    </View>
  );
}

export interface FeedGroupCardViewProps {
  group: FeedGroupInput;
  expanded: boolean;
  onToggle: () => void;
}

/**
 * Controlled presentation of a feed group card. The `expanded` state
 * is owned by the caller, which makes this layer trivial to render in
 * tests without React hooks.
 */
export function FeedGroupCardView({
  group,
  expanded,
  onToggle,
}: FeedGroupCardViewProps) {
  if (group.items.length === 0) {
    return null;
  }

  if (group.items.length === 1) {
    const item = group.items[0];
    if (!item) return null;
    return <FeedItemRow item={item} />;
  }

  // Top three covers form the visible stack; remaining items are still
  // accessible once the group is expanded.
  const covers = group.items
    .slice(0, 3)
    .map((it) => it.book?.coverUrl ?? null);
  const headline = summarizeGroup(group);

  return (
    <View style={styles.feedGroupCard}>
      <TouchableOpacity
        style={styles.feedGroupSummary}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={headline}
      >
        <View style={styles.feedGroupCovers} accessibilityElementsHidden={true} importantForAccessibility="no-hide-descendants">
          {covers.map((url, idx) => (
            <View
              key={`${group.groupKey}-cover-${idx}`}
              style={[
                styles.feedGroupCover,
                { left: idx * 18, zIndex: 3 - idx },
              ]}
            >
              {url ? (
                <Image
                  source={{ uri: url }}
                  style={styles.feedGroupCoverImage}
                  accessibilityLabel=""
                />
              ) : null}
            </View>
          ))}
        </View>
        <Text style={styles.feedGroupHeadline}>{headline}</Text>
        <Text style={styles.feedGroupChevron} accessibilityElementsHidden={true} importantForAccessibility="no-hide-descendants">
          {expanded ? "v" : ">"}
        </Text>
      </TouchableOpacity>
      {expanded ? (
        <View style={styles.feedGroupItems}>
          {group.items.map((item) => (
            <FeedItemRow key={item.event.id} item={item} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Stateful wrapper around `FeedGroupCardView` that owns the
 * expand/collapse state. When the group contains a single item we
 * render the existing single-event card layout. When it contains
 * multiple items we render a stacked-covers summary card that expands
 * on tap to reveal the underlying events.
 */
export function FeedGroupCard({ group }: FeedGroupCardProps) {
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded((v) => !v), []);
  return (
    <FeedGroupCardView group={group} expanded={expanded} onToggle={toggle} />
  );
}

/**
 * Render a chronological list of feed groups. The server-side
 * `feed.list` procedure already groups consecutive events by
 * `(actorId, verb)` over a sliding 24h window, so this view only has
 * to lay them out and handle expand-on-tap behaviour.
 *
 * Wraps the list in a `FlatList` so we can attach a `RefreshControl`
 * for pull-to-refresh — the AC for #137.
 */
export function FeedGroupedView({
  groups,
  emptyMessage,
  refreshing = false,
  onRefresh,
}: FeedGroupedViewProps) {
  const refreshControl = onRefresh ? (
    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
  ) : undefined;

  if (groups.length === 0) {
    return (
      <FlatList
        data={[]}
        renderItem={() => null}
        keyExtractor={() => ""}
        refreshControl={refreshControl}
        ListEmptyComponent={
          <Text style={styles.feedEmpty} accessibilityRole="text">
            {emptyMessage ?? "No activity yet."}
          </Text>
        }
        contentContainerStyle={styles.feedEmptyContainer}
      />
    );
  }

  return (
    <FlatList
      data={groups}
      keyExtractor={(group) => group.groupKey}
      renderItem={({ item }) => <FeedGroupCard group={item} />}
      refreshControl={refreshControl}
      contentContainerStyle={styles.feed}
    />
  );
}

const styles = StyleSheet.create({
  feed: {
    backgroundColor: "#F7F4ED",
    padding: 18,
    gap: 14,
  },
  feedEmpty: {
    color: "#676158",
    fontSize: 14,
    padding: 18,
    textAlign: "center",
  },
  feedEmptyContainer: {
    flexGrow: 1,
    justifyContent: "center",
    backgroundColor: "#F7F4ED",
  },
  feedItem: {
    alignItems: "flex-start",
    backgroundColor: "#FBFAF6",
    borderColor: "#E5DFD3",
    borderRadius: 4,
    borderWidth: 1,
    flexDirection: "row",
    gap: 18,
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  feedTextGroup: { flex: 1 },
  feedName: {
    color: "#253F5B",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    marginBottom: 5,
    textTransform: "uppercase",
  },
  feedAction: {
    color: "#171411",
    fontFamily: "serif",
    fontSize: 20,
    fontWeight: "600",
    lineHeight: 25,
  },
  feedBook: {
    color: "#676158",
    fontSize: 15,
    lineHeight: 23,
    marginTop: 4,
  },
  feedScore: {
    color: "#B9472D",
    fontFamily: "serif",
    fontSize: 28,
    fontWeight: "600",
    lineHeight: 34,
    minWidth: 48,
    textAlign: "right",
  },
  feedGroupCard: {
    backgroundColor: "#FBFAF6",
    borderColor: "#E5DFD3",
    borderRadius: 4,
    borderWidth: 1,
    overflow: "hidden",
  },
  feedGroupSummary: {
    alignItems: "center",
    flexDirection: "row",
    gap: 18,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  feedGroupCovers: {
    height: 72,
    position: "relative",
    width: 84,
  },
  feedGroupCover: {
    backgroundColor: "#E5DFD3",
    borderColor: "#FBFAF6",
    borderRadius: 4,
    borderWidth: 2,
    height: 72,
    overflow: "hidden",
    position: "absolute",
    top: 0,
    width: 48,
  },
  feedGroupCoverImage: {
    height: "100%",
    width: "100%",
  },
  feedGroupHeadline: {
    color: "#171411",
    flex: 1,
    fontFamily: "serif",
    fontSize: 18,
    fontWeight: "600",
    lineHeight: 23,
  },
  feedGroupChevron: {
    color: "#9B927D",
    fontSize: 16,
    fontWeight: "700",
  },
  feedGroupItems: {
    borderTopColor: "#E5DFD3",
    borderTopWidth: 1,
    gap: 8,
    padding: 12,
  },
});
