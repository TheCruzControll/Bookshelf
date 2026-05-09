import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import type { EntityId, Visibility } from "@hone/domain";

const VISIBILITY_OPTIONS: { value: Visibility; label: string }[] = [
  { value: "public", label: "Public" },
  { value: "followers", label: "Followers" },
  { value: "mutuals", label: "Mutuals" },
  { value: "private", label: "Private" },
];

export interface ReviewComposeProps {
  bookId: EntityId;
  editionId?: EntityId;
  initialBody?: string;
  initialVisibility?: Visibility;
  onSubmit: (args: { body: string; visibility: Visibility }) => Promise<void>;
}

export function ReviewCompose({
  bookId: _bookId,
  editionId: _editionId,
  initialBody = "",
  initialVisibility = "public",
  onSubmit,
}: ReviewComposeProps) {
  const [body, setBody] = useState(initialBody);
  const [visibility, setVisibility] = useState<Visibility>(initialVisibility);
  const [submitting, setSubmitting] = useState(false);
  const [conflictError, setConflictError] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!body.trim() || submitting) return;
    setSubmitting(true);
    setConflictError(false);
    setError(null);
    try {
      await onSubmit({ body: body.trim(), visibility });
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        (err.message.includes("409") || err.message.toLowerCase().includes("conflict"))
      ) {
        setConflictError(true);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.bodyInput}
        value={body}
        onChangeText={setBody}
        placeholder="Write your review…"
        placeholderTextColor="#9B927D"
        multiline
        textAlignVertical="top"
        accessibilityLabel="Review body"
        editable={!submitting}
      />
      <View style={styles.visibilityRow}>
        {VISIBILITY_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={[
              styles.visibilityButton,
              visibility === opt.value && styles.visibilityButtonActive,
            ]}
            onPress={() => setVisibility(opt.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: visibility === opt.value }}
            accessibilityLabel={opt.label}
            disabled={submitting}
          >
            <Text
              style={[
                styles.visibilityLabel,
                visibility === opt.value && styles.visibilityLabelActive,
              ]}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {conflictError ? (
        <Text style={styles.conflictError} accessibilityRole="alert">
          This review was updated elsewhere. Please reload and try again.
        </Text>
      ) : null}
      {error ? (
        <Text style={styles.genericError} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <TouchableOpacity
        style={[styles.submitButton, (!body.trim() || submitting) && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={!body.trim() || submitting}
        accessibilityRole="button"
        accessibilityLabel="Submit review"
      >
        {submitting ? (
          <ActivityIndicator color="#F7F4ED" />
        ) : (
          <Text style={styles.submitLabel}>Submit</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
    padding: 18,
  },
  bodyInput: {
    backgroundColor: "#FBFAF6",
    borderColor: "#E5DFD3",
    borderRadius: 6,
    borderWidth: 1,
    color: "#171411",
    fontSize: 16,
    lineHeight: 24,
    minHeight: 140,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  visibilityRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  visibilityButton: {
    borderColor: "#E5DFD3",
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  visibilityButtonActive: {
    backgroundColor: "#253F5B",
    borderColor: "#253F5B",
  },
  visibilityLabel: {
    color: "#676158",
    fontSize: 13,
    fontWeight: "600",
  },
  visibilityLabelActive: {
    color: "#F7F4ED",
  },
  conflictError: {
    color: "#B9472D",
    fontSize: 14,
    lineHeight: 20,
  },
  genericError: {
    color: "#B9472D",
    fontSize: 14,
    lineHeight: 20,
  },
  submitButton: {
    alignItems: "center",
    backgroundColor: "#253F5B",
    borderRadius: 6,
    paddingVertical: 14,
  },
  submitButtonDisabled: {
    opacity: 0.45,
  },
  submitLabel: {
    color: "#F7F4ED",
    fontSize: 16,
    fontWeight: "600",
  },
});
