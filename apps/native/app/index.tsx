import { ScrollView, StyleSheet, Text, View } from "react-native";

const feedItems = [
  {
    name: "Maya",
    action: "finished",
    book: "Tomorrow, and Tomorrow, and Tomorrow",
    score: "?"
  },
  {
    name: "Andre",
    action: "updated",
    book: "The Fifth Season",
    score: "9.12"
  },
  {
    name: "Sam",
    action: "dropped",
    book: "a dense biography",
    score: ""
  }
];

export default function HomeScreen() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.brandKanji}>本</Text>
        <Text style={styles.eyebrow}>Hone</Text>
        <Text style={styles.title}>Hone your taste through trusted readers.</Text>
        <Text style={styles.lede}>
          A quiet reading profile built from finished books, close comparisons,
          and the people whose judgment you trust.
        </Text>
      </View>
      <View style={styles.board}>
        <View style={styles.boardHeader}>
          <Text style={styles.boardLabel}>Friend activity</Text>
          <Text style={styles.boardLabel}>Today</Text>
        </View>
        {feedItems.map((item) => (
          <View style={styles.feedItem} key={`${item.name}-${item.book}`}>
            <View style={styles.feedTextGroup}>
              <Text style={styles.feedName}>{item.name}</Text>
              <Text style={styles.feedAction}>{item.action}</Text>
              <Text style={styles.feedBook}>{item.book}</Text>
            </View>
            {item.score ? <Text style={styles.feedScore}>{item.score}</Text> : null}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: "#F7F4ED",
    padding: 24,
    gap: 36
  },
  hero: {
    gap: 18,
    paddingTop: 56
  },
  brandKanji: {
    color: "#B9472D",
    fontFamily: "serif",
    fontSize: 44,
    fontWeight: "700",
    lineHeight: 48,
    marginBottom: 6
  },
  eyebrow: {
    color: "#253F5B",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.8,
    textTransform: "uppercase"
  },
  title: {
    color: "#171411",
    fontFamily: "serif",
    fontSize: 42,
    fontWeight: "600",
    lineHeight: 46
  },
  lede: {
    color: "#676158",
    fontSize: 17,
    lineHeight: 29
  },
  board: {
    minHeight: 470,
    justifyContent: "flex-end",
    backgroundColor: "#FBFAF6",
    borderColor: "#171411",
    borderWidth: 1
  },
  boardHeader: {
    borderBottomColor: "#171411",
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 16
  },
  boardLabel: {
    color: "#676158",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase"
  },
  feedItem: {
    alignItems: "flex-start",
    backgroundColor: "#FBFAF6",
    borderBottomColor: "#E5DFD3",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 18,
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 22
  },
  feedTextGroup: {
    flex: 1
  },
  feedName: {
    color: "#253F5B",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    marginBottom: 5,
    textTransform: "uppercase"
  },
  feedAction: {
    color: "#171411",
    fontFamily: "serif",
    fontSize: 20,
    fontWeight: "600",
    lineHeight: 25
  },
  feedBook: {
    color: "#676158",
    fontSize: 15,
    lineHeight: 23,
    marginTop: 4
  },
  feedScore: {
    color: "#B9472D",
    fontFamily: "serif",
    fontSize: 28,
    fontWeight: "600",
    lineHeight: 34,
    minWidth: 48,
    textAlign: "right"
  }
});
