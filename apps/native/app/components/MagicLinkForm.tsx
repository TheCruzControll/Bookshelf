import { useCallback, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";

export interface MagicLinkFormProps {
  /** Called when the user submits a valid-looking email. */
  onSubmit: (email: string) => Promise<void> | void;
  /** Optional initial email (e.g. resuming a flow). */
  initialEmail?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Magic-link request form (#64, E-09).
 *
 * Pure presentational: the parent injects the tRPC mutation. The
 * inline validation here just guards against blatantly invalid input
 * so the network round-trip is meaningful.
 */
export function MagicLinkForm({ onSubmit, initialEmail = "" }: MagicLinkFormProps) {
  const [email, setEmail] = useState(initialEmail);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = useCallback(async () => {
    const trimmed = email.trim();
    if (pending) return;
    if (!EMAIL_REGEX.test(trimmed)) {
      setError("Enter a valid email address.");
      return;
    }
    setError(null);
    setPending(true);
    try {
      await onSubmit(trimmed);
      setSent(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }, [email, pending, onSubmit]);

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        placeholderTextColor="#9B927D"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="Email"
        editable={!pending && !sent}
      />
      <TouchableOpacity
        style={[styles.submit, (pending || sent || !email.trim()) && styles.disabled]}
        onPress={handleSubmit}
        disabled={pending || sent || !email.trim()}
        accessibilityRole="button"
        accessibilityLabel="Send magic link"
      >
        {pending ? (
          <ActivityIndicator color="#F7F4ED" />
        ) : (
          <Text style={styles.submitLabel}>{sent ? "Check your email" : "Send magic link"}</Text>
        )}
      </TouchableOpacity>
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  input: {
    backgroundColor: "#FBFAF6",
    borderColor: "#E5DFD3",
    borderRadius: 6,
    borderWidth: 1,
    color: "#181512",
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  submit: {
    alignItems: "center",
    backgroundColor: "#253F5B",
    borderRadius: 6,
    paddingVertical: 12,
  },
  submitLabel: { color: "#F7F4ED", fontSize: 15, fontWeight: "600" },
  disabled: { opacity: 0.45 },
  error: { color: "#B9472D", fontSize: 13, lineHeight: 18 },
});
