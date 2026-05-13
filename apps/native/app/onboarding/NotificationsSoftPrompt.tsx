import { useCallback, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

export type IosPermissionStatus = "granted" | "denied" | "undetermined";

export interface NotificationsSoftPromptProps {
  /**
   * Trigger function called when the user opts into the native iOS
   * permission prompt. The auth-wiring PR plugs in
   * Notifications.requestPermissionsAsync(); this prop keeps the
   * component free of expo-notifications so tests can run in Node.
   */
  requestOsPermission?: () => Promise<IosPermissionStatus> | IosPermissionStatus;
}

/**
 * iOS shows the native permission dialog at most once per origin
 * lifetime. The spec requires a soft prompt first so we don't burn
 * the one-shot opportunity cold. Native parity for the web
 * NotificationsSoftPrompt (#65, E-10).
 */
export function NotificationsSoftPrompt({ requestOsPermission }: NotificationsSoftPromptProps) {
  const [state, setState] = useState<"idle" | "asking" | "granted" | "denied" | "undetermined">("idle");

  const handleEnable = useCallback(async () => {
    setState("asking");
    try {
      const fn = requestOsPermission ?? (() => "undetermined" as const);
      const result = await fn();
      setState(result);
    } catch {
      setState("undetermined");
    }
  }, [requestOsPermission]);

  return (
    <View style={styles.container} accessibilityLabel="Enable notifications">
      <Text style={styles.copy}>
        We&apos;ll only ping you for new followers, mutuals rating a book highly,
        mutuals finishing a book on your Want-to-Read shelf, and security alerts.
        You can fine-tune this anytime in Settings.
      </Text>

      {state === "idle" || state === "asking" ? (
        <TouchableOpacity
          style={[styles.button, state === "asking" && styles.buttonDisabled]}
          onPress={handleEnable}
          disabled={state === "asking"}
          accessibilityRole="button"
          accessibilityLabel="Enable notifications"
        >
          <Text style={styles.buttonLabel}>
            {state === "asking" ? "Asking…" : "Enable notifications"}
          </Text>
        </TouchableOpacity>
      ) : null}

      {state === "granted" ? (
        <Text style={styles.result} accessibilityRole="alert">
          Notifications enabled.
        </Text>
      ) : null}
      {state === "denied" ? (
        <Text style={styles.result} accessibilityRole="alert">
          Notifications were declined. You can enable them later in Settings.
        </Text>
      ) : null}
      {state === "undetermined" ? (
        <Text style={styles.result} accessibilityRole="alert">
          You can enable notifications later from Settings.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  copy: { color: "#181512", fontSize: 14, lineHeight: 20 },
  button: {
    alignItems: "center",
    backgroundColor: "#253F5B",
    borderRadius: 6,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  buttonDisabled: { opacity: 0.45 },
  buttonLabel: { color: "#F7F4ED", fontSize: 15, fontWeight: "600" },
  result: { color: "#676158", fontSize: 13, lineHeight: 18 },
});
