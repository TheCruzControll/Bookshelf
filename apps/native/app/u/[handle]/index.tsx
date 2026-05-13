import { useLocalSearchParams, useRouter } from "expo-router";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import type { Shelf } from "@hone/domain";
import { FollowButton } from "../../components/FollowButton";
import { ProfileLists } from "../../components/ProfileLists";

/**
 * Native profile screen at /u/{handle} (#92, I-05).
 *
 * Mirrors apps/web/app/u/[handle]/page.tsx — surfaces follow/unfollow
 * affordances plus a Lists section that includes editorial and
 * algorithmic lists on equal footing with user lists.
 *
 * Data fetching is a parent-supplied seam for the tRPC wiring PR.
 */
export default function ProfileScreen() {
  const params = useLocalSearchParams<{ handle: string }>();
  const router = useRouter();
  const handle = params.handle ?? "";

  // Wiring placeholders — overridden by the tRPC integration PR.
  const targetUserId: string = "";
  const initialIsFollowing = false;
  const lists: Shelf[] = [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.handle} accessibilityRole="header">
          @{handle}
        </Text>
        <FollowButton
          targetUserId={targetUserId}
          initialIsFollowing={initialIsFollowing}
          onFollow={async () => {}}
          onUnfollow={async () => {}}
          disabled={targetUserId === ""}
        />
      </View>
      <ProfileLists
        lists={lists}
        onListPress={(slug) => {
          router.push(`/u/${handle}/lists/${slug}`);
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F2EA" },
  content: { paddingVertical: 18 },
  header: { paddingHorizontal: 18, gap: 12 },
  handle: { color: "#181512", fontSize: 22, fontWeight: "700" },
});
