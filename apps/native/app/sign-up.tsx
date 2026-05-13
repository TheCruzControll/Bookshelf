import { View, Text, ScrollView, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { OAuthButtons } from "./components/OAuthButtons";
import { MagicLinkForm } from "./components/MagicLinkForm";

/**
 * Native sign-up screen (#64, E-09).
 *
 * Same three providers as sign-in; the server distinguishes new vs.
 * existing accounts via isNewUser on the sign-in mutation results.
 * Reusing the components avoids drift between the two surfaces.
 */
export default function SignUpScreen() {
  const router = useRouter();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.heading} accessibilityRole="header">
        Create your Hone account
      </Text>
      <Text style={styles.subhead}>It only takes a tap.</Text>

      <View style={styles.section}>
        <OAuthButtons onProvider={async () => {}} />
      </View>

      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or</Text>
        <View style={styles.dividerLine} />
      </View>

      <View style={styles.section}>
        <MagicLinkForm onSubmit={async () => {}} />
      </View>

      <Text
        style={styles.altLink}
        onPress={() => router.push("/sign-in")}
        accessibilityRole="link"
        accessibilityLabel="Sign in instead"
      >
        Already on Hone? Sign in
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
  altLink: { color: "#253F5B", fontSize: 14, fontWeight: "600", marginTop: 16 },
});
