import { View, Text, FlatList, StyleSheet, TouchableOpacity } from "react-native";
import type { Shelf } from "@hone/domain";

export interface ProfileListsProps {
  /** All lists (shelves with kind="list") for the profile being viewed. */
  lists: Shelf[];
  /** Called when the user taps a list row. Should navigate to /u/{handle}/lists/{slug}. */
  onListPress: (slug: string) => void;
}

function badge(authorType: Shelf["authorType"]): string | null {
  if (authorType === "internal_editorial") return "Verified";
  if (authorType === "algorithmic") return "Curated by Hone";
  return null;
}

/**
 * Native parity for the profile-page "Lists" section (#92, I-05).
 *
 * Surfaces user, editorial, and algorithmic lists on equal footing,
 * each tagged with its provenance badge where applicable.
 */
export function ProfileLists({ lists, onListPress }: ProfileListsProps) {
  if (lists.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.heading} accessibilityRole="header">
        Lists
      </Text>
      <FlatList
        data={lists}
        keyExtractor={(l) => l.id}
        scrollEnabled={false}
        renderItem={({ item }) => {
          const tag = badge(item.authorType);
          return (
            <TouchableOpacity
              style={styles.row}
              onPress={() => onListPress(item.slug)}
              accessibilityRole="button"
              accessibilityLabel={item.name}
            >
              <Text style={styles.name}>{item.name}</Text>
              {tag ? (
                <Text style={styles.badge} accessibilityLabel={`${tag} list`}>
                  {tag}
                </Text>
              ) : null}
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: 18, paddingVertical: 12, gap: 8 },
  heading: { color: "#181512", fontSize: 16, fontWeight: "700" },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    paddingVertical: 8,
  },
  name: { color: "#181512", flex: 1, fontSize: 15 },
  badge: {
    backgroundColor: "#253F5B",
    borderRadius: 4,
    color: "#F7F4ED",
    fontSize: 11,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
});
