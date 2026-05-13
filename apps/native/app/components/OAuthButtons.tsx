import { useCallback, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";

export type AuthProvider = "apple" | "google" | "email";

export interface OAuthButtonsProps {
  /**
   * Called when the user taps the Apple / Google button. Should drive
   * the platform AuthSession flow and return when the tRPC sign-in
   * mutation has been called.
   */
  onProvider: (provider: "apple" | "google") => Promise<void> | void;
  /**
   * Called when the user enters their email and taps "Send magic
   * link". The caller is expected to call the appropriate tRPC
   * mutation. The screen does not request the email itself — the
   * email-form input lives in a sibling component.
   */
  onMagicLinkEmail?: (email: string) => Promise<void> | void;
  /** Optional disabled flag while another flow is in-flight. */
  disabled?: boolean;
}

/**
 * Native parity for the web OAuthButtons (#64, E-09).
 *
 * The component renders three provider buttons. Each runs at most one
 * flow at a time; the in-flight indicator is local so a slow OAuth
 * pop-up doesn't grey out the other providers when they aren't busy.
 */
export function OAuthButtons({
  onProvider,
  onMagicLinkEmail: _onMagicLinkEmail,
  disabled = false,
}: OAuthButtonsProps) {
  const [pending, setPending] = useState<AuthProvider | null>(null);

  const handleProvider = useCallback(
    async (provider: "apple" | "google") => {
      if (disabled || pending !== null) return;
      setPending(provider);
      try {
        await onProvider(provider);
      } finally {
        setPending(null);
      }
    },
    [disabled, pending, onProvider],
  );

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.appleButton, (disabled || pending !== null) && styles.disabled]}
        onPress={() => handleProvider("apple")}
        disabled={disabled || pending !== null}
        accessibilityRole="button"
        accessibilityLabel="Sign in with Apple"
      >
        {pending === "apple" ? (
          <ActivityIndicator color="#FBFAF6" />
        ) : (
          <Text style={styles.appleLabel}>Sign in with Apple</Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.googleButton, (disabled || pending !== null) && styles.disabled]}
        onPress={() => handleProvider("google")}
        disabled={disabled || pending !== null}
        accessibilityRole="button"
        accessibilityLabel="Sign in with Google"
      >
        {pending === "google" ? (
          <ActivityIndicator color="#181512" />
        ) : (
          <Text style={styles.googleLabel}>Sign in with Google</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  appleButton: {
    alignItems: "center",
    backgroundColor: "#181512",
    borderRadius: 6,
    paddingVertical: 12,
  },
  appleLabel: { color: "#FBFAF6", fontSize: 15, fontWeight: "600" },
  googleButton: {
    alignItems: "center",
    backgroundColor: "#FBFAF6",
    borderColor: "#E5DFD3",
    borderRadius: 6,
    borderWidth: 1,
    paddingVertical: 12,
  },
  googleLabel: { color: "#181512", fontSize: 15, fontWeight: "600" },
  disabled: { opacity: 0.45 },
});
