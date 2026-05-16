import { useEffect, useRef } from "react";
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import type { EntityId, InAppNotificationInput } from "@hone/domain";

export interface NotificationCenterProps {
  /** Notifications to render, newest first. */
  notifications: InAppNotificationInput[];
  /**
   * Called with each unread notification id when the list mounts. Should
   * call `notifications.markRead` on the server. The component guarantees
   * each id is reported at most once per mount.
   */
  onMarkRead: (notificationId: EntityId) => Promise<void> | void;
  /** Optional handler for loading more (cursor-based pagination). */
  onLoadMore?: () => Promise<void> | void;
  /** Whether more notifications are available. Hides the "Load more" button when false. */
  hasMore?: boolean;
  /** Whether a load is in flight. Disables the "Load more" button. */
  isLoading?: boolean;
}

function renderTriggerLabel(trigger: InAppNotificationInput["trigger"]): string {
  switch (trigger) {
    case "new_follower":
      return "started following you";
    case "mutual_follow_back":
      return "followed you back";
    case "mutual_rated_high":
      return "rated a book highly";
    case "mutual_finished_want_to_read":
      return "finished a book on your Want-to-Read";
    case "security_event":
      return "security alert";
    default:
      return "sent you a notification";
  }
}

/**
 * Native parity for the web NotificationCenter (#149, Q-05).
 *
 * Pure presentational: the parent screen fetches notifications via tRPC
 * (`notifications.list`) and supplies a callback that calls
 * `notifications.markRead`. The component reports each unread id once per
 * mount so the parent can flip the server-side `readAt`.
 */
export function NotificationCenter({
  notifications,
  onMarkRead,
  onLoadMore,
  hasMore = false,
  isLoading = false,
}: NotificationCenterProps) {
  const reportedRef = useRef<Set<EntityId>>(new Set());

  useEffect(() => {
    for (const n of notifications) {
      if (n.readAt) continue;
      if (reportedRef.current.has(n.id)) continue;
      reportedRef.current.add(n.id);
      void onMarkRead(n.id);
    }
  }, [notifications, onMarkRead]);

  if (notifications.length === 0) {
    return (
      <View style={styles.container} accessibilityLabel="Notifications">
        <Text style={styles.empty}>No notifications yet.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container} accessibilityLabel="Notifications">
      <FlatList
        data={notifications}
        keyExtractor={(n) => n.id}
        renderItem={({ item }) => (
          <View
            style={[styles.row, item.readAt ? styles.rowRead : styles.rowUnread]}
            accessibilityLabel={item.readAt ? "Read notification" : "Unread notification"}
          >
            <View style={styles.rowText}>
              <Text style={styles.trigger}>{renderTriggerLabel(item.trigger)}</Text>
              <Text style={styles.time} accessibilityLabel={item.createdAt.toISOString()}>
                {item.createdAt.toISOString()}
              </Text>
            </View>
            {!item.readAt ? <View style={styles.dot} accessibilityLabel="Unread" /> : null}
          </View>
        )}
      />
      {hasMore && onLoadMore ? (
        <TouchableOpacity
          style={[styles.loadMore, isLoading && styles.loadMoreDisabled]}
          onPress={() => {
            void onLoadMore();
          }}
          disabled={isLoading}
          accessibilityRole="button"
          accessibilityLabel="Load more notifications"
          accessibilityState={{ disabled: isLoading }}
        >
          {isLoading ? (
            <ActivityIndicator color="#181512" />
          ) : (
            <Text style={styles.loadMoreLabel}>Load more</Text>
          )}
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F2EA" },
  empty: { color: "#676158", fontSize: 14, lineHeight: 20, padding: 18 },
  row: {
    alignItems: "center",
    borderBottomColor: "#E5DFD3",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  rowRead: { backgroundColor: "#F7F2EA" },
  rowUnread: { backgroundColor: "#FBFAF6" },
  rowText: { flex: 1, gap: 4 },
  trigger: { color: "#181512", fontSize: 15, fontWeight: "500" },
  time: { color: "#9B927D", fontSize: 12 },
  dot: {
    backgroundColor: "#B9472D",
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  loadMore: {
    alignItems: "center",
    backgroundColor: "#FBFAF6",
    borderTopColor: "#E5DFD3",
    borderTopWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  loadMoreDisabled: { opacity: 0.45 },
  loadMoreLabel: { color: "#181512", fontSize: 14, fontWeight: "600" },
});
