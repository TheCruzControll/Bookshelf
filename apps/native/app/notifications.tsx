import { useCallback, useState } from "react";
import { View, StyleSheet, Text } from "react-native";
import type { EntityId, InAppNotificationInput, NotificationPlatformInput } from "@hone/domain";
import { NotificationCenter } from "./components/NotificationCenter";
import {
  usePushTokenRegistration,
  type PushPermissionStatus,
  type PushTokenRegistrationDeps,
} from "./components/usePushTokenRegistration";

export interface NotificationsScreenProps {
  /**
   * Initial notifications, newest first. Wired to `notifications.list` by
   * the tRPC-integration PR; kept as a parent-supplied seam so the screen
   * is testable in Node without a network.
   */
  initialNotifications?: InAppNotificationInput[];
  /** Whether more notifications are available behind the cursor. */
  hasMore?: boolean;
  /** Cursor handler; defers to the wiring PR. */
  onLoadMore?: () => Promise<void> | void;
  /** Maps to `notifications.markRead` mutation. */
  onMarkRead?: (notificationId: EntityId) => Promise<void> | void;
  /** Override the push-registration deps (used for tests / app-shell wiring). */
  pushRegistrationDeps?: PushTokenRegistrationDeps;
  /** Auto-request permission on mount. Default true. */
  autoRequestPushPermission?: boolean;
}

const NOOP_PUSH_DEPS: PushTokenRegistrationDeps = {
  requestPermission: (): PushPermissionStatus => "undetermined",
  getDeviceToken: async (): Promise<{ platform: NotificationPlatformInput; token: string }> => ({
    platform: "apns",
    token: "",
  }),
  registerToken: async () => undefined,
};

/**
 * Native notifications center at `/notifications` (#150, Q-06).
 *
 * Renders the same shape as the web NotificationCenter (#149) plus, on
 * mount, asks for OS push permission and registers the device token with
 * `notifications.registerToken`. The screen is purely presentational —
 * the app shell injects the expo-notifications and tRPC bindings so the
 * file stays runnable under vitest in Node.
 */
export default function NotificationsScreen({
  initialNotifications = [],
  hasMore = false,
  onLoadMore,
  onMarkRead,
  pushRegistrationDeps = NOOP_PUSH_DEPS,
  autoRequestPushPermission = true,
}: NotificationsScreenProps) {
  const [notifications] = useState<InAppNotificationInput[]>(initialNotifications);

  const handleMarkRead = useCallback(
    async (id: EntityId) => {
      if (onMarkRead) {
        await onMarkRead(id);
      }
    },
    [onMarkRead],
  );

  const { state: pushState } = usePushTokenRegistration(pushRegistrationDeps, {
    autoRequestOnMount: autoRequestPushPermission,
  });

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.heading} accessibilityRole="header">
          Notifications
        </Text>
        <Text style={styles.statusLine} accessibilityLabel={`Push registration ${pushState}`}>
          Push: {pushState}
        </Text>
      </View>
      <NotificationCenter
        notifications={notifications}
        onMarkRead={handleMarkRead}
        {...(onLoadMore ? { onLoadMore } : {})}
        hasMore={hasMore}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F7F2EA" },
  header: {
    borderBottomColor: "#E5DFD3",
    borderBottomWidth: 1,
    gap: 4,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  heading: { color: "#181512", fontSize: 22, fontWeight: "700" },
  statusLine: { color: "#9B927D", fontSize: 12 },
});
