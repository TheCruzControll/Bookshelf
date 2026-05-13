import { useEffect } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { firstIncompleteStep } from "./steps";
import type { OnboardingState } from "./steps";

/**
 * Onboarding dispatcher (#65, E-10).
 *
 * Mirrors the web /onboarding index. When viewer state is supplied
 * (placeholder hook here; the auth-wiring PR plugs in the real
 * fetch) we redirect to the first incomplete step. Otherwise the
 * generic welcome renders.
 */
async function fetchOnboardingState(): Promise<OnboardingState | null> {
  return null;
}

export default function OnboardingIndexScreen() {
  const router = useRouter();

  useEffect(() => {
    void (async () => {
      const state = await fetchOnboardingState();
      if (!state) return;
      const next = firstIncompleteStep(state);
      if (next) {
        router.replace(`/onboarding/${next}`);
      } else {
        router.replace("/");
      }
    })();
  }, [router]);

  return (
    <View style={styles.screen}>
      <Text style={styles.heading} accessibilityRole="header">
        Welcome to Hone
      </Text>
      <Text style={styles.body}>Let&apos;s get your taste profile set up.</Text>
      <ActivityIndicator color="#253F5B" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { alignItems: "center", backgroundColor: "#F7F2EA", flex: 1, gap: 12, justifyContent: "center", padding: 24 },
  heading: { color: "#181512", fontSize: 22, fontWeight: "700" },
  body: { color: "#676158", fontSize: 14 },
});
