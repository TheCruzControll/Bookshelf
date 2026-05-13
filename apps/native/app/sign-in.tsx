import { View, Text, ScrollView, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { OAuthButtons } from "./components/OAuthButtons";
import { MagicLinkForm } from "./components/MagicLinkForm";

/**
 * Native sign-in screen (#64, E-09).
 *
 * Wires three auth providers: Apple, Google, and email magic link.
 * The Apple/Google handlers are placeholders that the auth-wiring PR
 * will swap for expo-auth-session AuthRequest flows; the magic-link
 * deep-link callback at /auth/callback consumes the returned token.
 */
export default function SignInScreen() {
  const router = useRouter();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.heading} accessibilityRole="header">
        Sign in to Hone
      </Text>
      <Text style={styles.subhead}>Pick a way to continue.</Text>

      <View style={styles.section}>
        <OAuthButtons
          onProvider={async (provider) => {
            // Wired by the auth integration PR — placeholder so the
            // screen renders and tests cover the contract.
            void provider;
          }}
        />
      </View>

      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or</Text>
        <View style={styles.dividerLine} />
      </View>

      <View style={styles.section}>
        <MagicLinkForm
          onSubmit={async (email) => {
            // Wired by the auth integration PR.
            void email;
          }}
        />
      </View>

      <Text style={styles.note}>
        We send a one-tap link to your inbox; opening it returns you to the app.
      </Text>
      <Text
        style={styles.altLink}
        onPress={() => router.push("/sign-up")}
        accessibilityRole="link"
        accessibilityLabel="Create an account"
      >
        New to Hone? Create an account
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: "#F7F2EA", flex: 1 },
  content: { gap: 16, padding: 24, paddingTop: 40 },
  heading: { color: "#181512", fontSize: 24, fontWeight: "700" },
  subhead: { color: "#676158", fontSize: 14 },
  section: { gap: 10 },
  divider: { alignItems: "center", flexDirection: "row", gap: 10, marginVertical: 4 },
  dividerLine: { backgroundColor: "#E5DFD3", flex: 1, height: 1 },
  dividerText: { color: "#676158", fontSize: 12 },
  note: { color: "#676158", fontSize: 12, lineHeight: 18 },
  altLink: { color: "#253F5B", fontSize: 14, fontWeight: "600", marginTop: 16 },
});
