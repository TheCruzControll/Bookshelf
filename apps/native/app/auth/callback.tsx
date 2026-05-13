import { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

/**
 * Magic-link deep-link landing (#64, E-09).
 *
 * Expo's expo-router resolves deep links to file routes. The magic-link
 * email points users at hone://auth/callback?token=… which lands here.
 * This screen reads the token from the URL params, calls the consume
 * handler, and navigates home on success.
 *
 * The consume handler is parent-supplied (placeholder for now); the
 * auth-wiring PR will pass the tRPC mutation that exchanges the token
 * for a session.
 */
export interface MagicLinkConsumeFn {
  (token: string): Promise<void>;
}

const placeholderConsume: MagicLinkConsumeFn = async () => {
  // Replaced by the auth-wiring PR.
};

export default function AuthCallbackScreen() {
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const router = useRouter();
  const [state, setState] = useState<"working" | "ok" | "error" | "missing">("working");

  const token = Array.isArray(params.token) ? params.token[0] : params.token;

  useEffect(() => {
    if (!token) {
      setState("missing");
      return;
    }
    void (async () => {
      try {
        await placeholderConsume(token);
        setState("ok");
        router.replace("/");
      } catch {
        setState("error");
      }
    })();
  }, [token, router]);

  return (
    <View style={styles.screen} accessibilityLabel="Magic-link landing">
      {state === "working" ? (
        <>
          <ActivityIndicator color="#253F5B" />
          <Text style={styles.text}>Signing you in…</Text>
        </>
      ) : null}
      {state === "missing" ? (
        <Text style={styles.text} accessibilityRole="alert">
          This link is missing a token. Open the link from the email again.
        </Text>
      ) : null}
      {state === "error" ? (
        <Text style={styles.text} accessibilityRole="alert">
          We couldn&apos;t sign you in with that link. Try requesting a new one.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { alignItems: "center", backgroundColor: "#F7F2EA", flex: 1, gap: 12, justifyContent: "center", padding: 24 },
  text: { color: "#181512", fontSize: 15, textAlign: "center" },
});
