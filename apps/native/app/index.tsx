import { ScrollView, StyleSheet, Text, View } from "react-native";

const feedItems = [
  {
    name: "Maya",
    action: "finished",
    book: "Tomorrow, and Tomorrow, and Tomorrow",
    shelf: "modern favorites"
  },
  {
    name: "Andre",
    action: "ranked",
    book: "The Fifth Season",
    shelf: "#1 on sci-fi"
  },
  {
    name: "Sam",
    action: "dropped",
    book: "a dense biography",
    shelf: "and saved three essays"
  }
];

export default function HomeScreen() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.hero}>
        <View style={styles.mark} accessibilityElementsHidden>
          <View style={[styles.bookMark, styles.bookOne]} />
          <View style={[styles.bookMark, styles.bookTwo]} />
          <View style={[styles.bookMark, styles.bookThree]} />
        </View>
        <Text style={styles.eyebrow}>Hone</Text>
        <Text style={styles.title}>Hone your taste through trusted readers.</Text>
        <Text style={styles.lede}>
          A warm social shelf for ranking books, following friends, and finding
          the next thing worth carrying around.
        </Text>
      </View>
      <View style={styles.board}>
        <View style={styles.sun} />
        <View style={styles.leaf} />
        <View style={styles.moon} />
        {feedItems.map((item) => (
          <View style={styles.feedItem} key={`${item.name}-${item.book}`}>
            <Text style={styles.feedName}>{item.name}</Text>
            <Text style={styles.feedAction}>{item.action}</Text>
            <Text style={styles.feedBook}>{item.book}</Text>
            <Text style={styles.feedShelf}>{item.shelf}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: "#F4E8CF",
    padding: 24,
    gap: 30
  },
  hero: {
    gap: 16,
    paddingTop: 48
  },
  mark: {
    height: 72,
    width: 96
  },
  bookMark: {
    position: "absolute",
    borderColor: "#1E1814",
    borderWidth: 3
  },
  bookOne: {
    left: 0,
    top: 13,
    width: 36,
    height: 48,
    backgroundColor: "#D96629",
    borderRadius: 10,
    transform: [{ rotate: "-4deg" }]
  },
  bookTwo: {
    left: 29,
    top: 4,
    width: 34,
    height: 58,
    backgroundColor: "#437742",
    borderRadius: 12,
    transform: [{ rotate: "3deg" }]
  },
  bookThree: {
    left: 58,
    top: 17,
    width: 30,
    height: 43,
    backgroundColor: "#A2B0AD",
    borderRadius: 10,
    transform: [{ rotate: "8deg" }]
  },
  eyebrow: {
    color: "#BB7125",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1.1,
    textTransform: "uppercase"
  },
  title: {
    color: "#1E1814",
    fontFamily: "Georgia",
    fontSize: 43,
    fontWeight: "700",
    lineHeight: 45
  },
  lede: {
    color: "#55483B",
    fontSize: 18,
    lineHeight: 27
  },
  board: {
    position: "relative",
    gap: 12,
    minHeight: 500,
    justifyContent: "flex-end",
    backgroundColor: "#EBD3A2",
    borderColor: "#1E1814",
    borderRadius: 26,
    borderWidth: 3,
    padding: 18,
    shadowColor: "#12354E",
    shadowOpacity: 0.16,
    shadowRadius: 0,
    shadowOffset: { width: 10, height: 12 }
  },
  sun: {
    position: "absolute",
    left: 24,
    top: 28,
    width: 106,
    height: 106,
    backgroundColor: "#D96629",
    borderColor: "#1E1814",
    borderRadius: 54,
    borderWidth: 3
  },
  leaf: {
    position: "absolute",
    right: 24,
    top: 52,
    width: 116,
    height: 74,
    backgroundColor: "#437742",
    borderColor: "#1E1814",
    borderRadius: 42,
    borderWidth: 3,
    transform: [{ rotate: "-13deg" }]
  },
  moon: {
    position: "absolute",
    left: 136,
    top: 150,
    width: 72,
    height: 72,
    backgroundColor: "#12354E",
    borderColor: "#1E1814",
    borderRadius: 36,
    borderWidth: 3
  },
  feedItem: {
    backgroundColor: "#F8EDDB",
    borderColor: "#1E1814",
    borderRadius: 14,
    borderWidth: 2,
    padding: 16,
    shadowColor: "#533619",
    shadowOpacity: 0.14,
    shadowRadius: 0,
    shadowOffset: { width: 4, height: 5 }
  },
  feedName: {
    color: "#BB7125",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
    marginBottom: 5,
    textTransform: "uppercase"
  },
  feedAction: {
    color: "#1E1814",
    fontFamily: "Georgia",
    fontSize: 22,
    fontWeight: "700",
    lineHeight: 24
  },
  feedBook: {
    color: "#55483B",
    fontSize: 16,
    lineHeight: 22,
    marginTop: 4
  },
  feedShelf: {
    color: "#12354E",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 9
  }
});
