import { ScrollView, StyleSheet, Text, View } from "react-native";

const feedItems = [
  "Maya finished Tomorrow, and Tomorrow, and Tomorrow",
  "Andre ranked The Fifth Season #1 on Sci-Fi",
  "Sam added three essays to Want to Read"
];

export default function HomeScreen() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>Hone</Text>
        <Text style={styles.title}>Your friends' reading, ranked.</Text>
        <Text style={styles.lede}>
          Build shelves, rank books, and discover what to read through people
          you trust.
        </Text>
      </View>
      <View style={styles.feed}>
        {feedItems.map((item) => (
          <View style={styles.feedItem} key={item}>
            <Text style={styles.feedText}>{item}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: "#F7F2EA",
    padding: 24,
    gap: 28
  },
  hero: {
    gap: 14,
    paddingTop: 48
  },
  eyebrow: {
    color: "#735C36",
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase"
  },
  title: {
    color: "#181512",
    fontSize: 44,
    fontWeight: "800",
    lineHeight: 46
  },
  lede: {
    color: "#4B4741",
    fontSize: 18,
    lineHeight: 27
  },
  feed: {
    gap: 12
  },
  feedItem: {
    backgroundColor: "#FFFAF2",
    borderColor: "#DED4C5",
    borderRadius: 8,
    borderWidth: 1,
    padding: 16
  },
  feedText: {
    color: "#2A251F",
    fontSize: 16,
    lineHeight: 22
  }
});

