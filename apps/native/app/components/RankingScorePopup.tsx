import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { SCORE_UNLOCK_THRESHOLD } from "@hone/domain";

export interface RankingScorePopupProps {
  bookTitle: string;
  score: number;
  finishedCount: number;
  note?: string;
  onClose: () => void;
}

/**
 * Native ranking flow step 3 (#116, L-08) — mirrors the web
 * RankingScorePopup. Renders ?-and-calibration before unlock, a
 * dedicated "Taste Scores Unlocked" headline at exactly the
 * threshold, and the numeric score thereafter.
 */
export function RankingScorePopup({
  bookTitle,
  score,
  finishedCount,
  note,
  onClose,
}: RankingScorePopupProps) {
  const unlocked = finishedCount >= SCORE_UNLOCK_THRESHOLD;
  const justUnlocked = unlocked && finishedCount === SCORE_UNLOCK_THRESHOLD;

  return (
    <View
      style={styles.modal}
      accessibilityLabel={
        justUnlocked
          ? "Taste scores unlocked"
          : unlocked
            ? "Score result"
            : "Calibration progress"
      }
    >
      <Text style={styles.title}>{justUnlocked ? "Taste Scores Unlocked" : bookTitle}</Text>
      <Text style={styles.score} accessibilityLabel="Score">
        {unlocked ? score.toFixed(2) : "?"}
      </Text>
      {!unlocked ? (
        <Text style={styles.calibration} accessibilityLabel="Calibration progress">
          {finishedCount}/{SCORE_UNLOCK_THRESHOLD} ranked
        </Text>
      ) : null}
      {note ? <Text style={styles.note}>{note}</Text> : null}
      <TouchableOpacity
        style={styles.submit}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
      >
        <Text style={styles.submitLabel}>Done</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  modal: { alignItems: "center", backgroundColor: "#FBFAF6", borderRadius: 12, gap: 12, padding: 24 },
  title: { color: "#181512", fontSize: 18, fontWeight: "700", textAlign: "center" },
  score: { color: "#253F5B", fontSize: 48, fontVariant: ["tabular-nums"], fontWeight: "700" },
  calibration: { color: "#676158", fontSize: 14 },
  note: { color: "#181512", fontSize: 14, fontStyle: "italic", textAlign: "center" },
  submit: { alignItems: "center", backgroundColor: "#253F5B", borderRadius: 6, paddingHorizontal: 20, paddingVertical: 12 },
  submitLabel: { color: "#F7F4ED", fontSize: 14, fontWeight: "600" },
});
