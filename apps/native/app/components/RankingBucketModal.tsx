import { useCallback, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";

export type StarBucket = 1 | 2 | 3 | 4 | 5;

export interface RankingBucketModalProps {
  bookTitle: string;
  onSelect: (bucket: StarBucket) => Promise<void> | void;
  onCancel?: () => void;
  initialBucket?: StarBucket;
}

const ALL_BUCKETS: StarBucket[] = [1, 2, 3, 4, 5];

/**
 * Native ranking flow step 1 (#116, L-08) — mirrors the web component
 * RankingBucketModal. Bucket is never surfaced after submission per
 * docs/ranking-flow-spec.md.
 */
export function RankingBucketModal({
  bookTitle,
  onSelect,
  onCancel,
  initialBucket,
}: RankingBucketModalProps) {
  const [selected, setSelected] = useState<StarBucket | null>(initialBucket ?? null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (selected === null || submitting) return;
    setSubmitting(true);
    try {
      await onSelect(selected);
    } finally {
      setSubmitting(false);
    }
  }, [selected, submitting, onSelect]);

  return (
    <View style={styles.modal} accessibilityRole="alert" accessibilityLabel="Choose star bucket">
      <Text style={styles.title}>How was {bookTitle}?</Text>
      <Text style={styles.hint}>Pick a starting bucket; comparisons will refine it.</Text>

      <View style={styles.row} accessibilityRole="radiogroup">
        {ALL_BUCKETS.map((b) => (
          <TouchableOpacity
            key={b}
            accessibilityRole="radio"
            accessibilityState={{ selected: selected === b }}
            accessibilityLabel={`${b} ${b === 1 ? "star" : "stars"}`}
            style={[styles.star, selected === b ? styles.starSelected : null]}
            onPress={() => setSelected(b)}
            disabled={submitting}
          >
            <Text style={selected === b ? styles.starLabelSelected : styles.starLabel}>
              {"★".repeat(b)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.actions}>
        {onCancel ? (
          <TouchableOpacity onPress={onCancel} disabled={submitting} accessibilityRole="button" accessibilityLabel="Cancel">
            <Text style={styles.cancel}>Cancel</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={selected === null || submitting}
          style={[styles.submit, (selected === null || submitting) && styles.submitDisabled]}
          accessibilityRole="button"
          accessibilityLabel="Next"
        >
          {submitting ? <ActivityIndicator color="#F7F4ED" /> : <Text style={styles.submitLabel}>Next</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  modal: { backgroundColor: "#FBFAF6", borderRadius: 12, gap: 16, padding: 20 },
  title: { color: "#181512", fontSize: 18, fontWeight: "700" },
  hint: { color: "#676158", fontSize: 13 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  star: { borderColor: "#E5DFD3", borderRadius: 6, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8 },
  starSelected: { backgroundColor: "#253F5B", borderColor: "#253F5B" },
  starLabel: { color: "#676158", fontSize: 14 },
  starLabelSelected: { color: "#F7F4ED", fontSize: 14 },
  actions: { alignItems: "center", flexDirection: "row", gap: 12, justifyContent: "flex-end" },
  cancel: { color: "#676158", fontSize: 14, fontWeight: "600" },
  submit: { alignItems: "center", backgroundColor: "#253F5B", borderRadius: 6, paddingHorizontal: 18, paddingVertical: 10 },
  submitDisabled: { opacity: 0.45 },
  submitLabel: { color: "#F7F4ED", fontSize: 14, fontWeight: "600" },
});
