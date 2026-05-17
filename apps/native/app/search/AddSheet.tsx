import { useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import type {
  BookSearchResultInput,
  EntityId,
  ReadingStatus,
  Visibility,
} from "@hone/domain";

/**
 * One option in the shelf picker. The system shelves (Reading, Want to
 * Read, Finished, Dropped) are auto-seeded for every profile during
 * `profile.createProfile` — the parent search panel injects the viewer's
 * shelves here.
 */
export interface ShelfOption {
  id: EntityId;
  name: string;
  isSystem: boolean;
}

export interface AddSheetSubmission {
  status: ReadingStatus;
  shelfId: EntityId | null;
  visibility: Visibility;
  note: string;
}

export interface AddSheetProps {
  /** Whether the sheet is currently visible. */
  visible: boolean;
  /** The catalog result the viewer is saving. */
  book: BookSearchResultInput;
  /** Shelves the viewer can save to. */
  shelves: ReadonlyArray<ShelfOption>;
  /** Initial status; defaults to `want_to_read` per the Add flow spec. */
  initialStatus?: ReadingStatus;
  /** Initial visibility; defaults to `followers` per the Add flow spec. */
  initialVisibility?: Visibility;
  /** Initial shelf id; defaults to `null` (no specific shelf). */
  initialShelfId?: EntityId | null;
  /** Initial note body; defaults to the empty string. */
  initialNote?: string;
  /** Called when the viewer hits Save. Should call the tRPC mutation. */
  onSubmit: (submission: AddSheetSubmission) => Promise<void>;
  /** Called when the viewer dismisses the sheet without saving. */
  onCancel: () => void;
}

const STATUS_OPTIONS: { value: ReadingStatus; label: string }[] = [
  { value: "want_to_read", label: "Want to read" },
  { value: "reading", label: "Reading" },
  { value: "finished", label: "Finished" },
  { value: "dropped", label: "Dropped" },
];

const VISIBILITY_OPTIONS: {
  value: Visibility;
  label: string;
  hint: string;
}[] = [
  { value: "public", label: "Public", hint: "Anyone on the internet" },
  { value: "followers", label: "Followers", hint: "People who follow you" },
  { value: "mutuals", label: "Mutuals", hint: "Followers you follow back" },
  { value: "private", label: "Private", hint: "Only you" },
];

/**
 * The native Add Sheet (G-03, #77) opened when a viewer selects a result
 * on /search. Native parity for `apps/web/app/search/AddSheet.tsx`.
 *
 * Uses React Native's `Modal` as the "native sheet primitive" — slides
 * up from the bottom (`animationType="slide"`) over the search surface.
 *
 * Collects the four inputs called out in the AC:
 *  - Status: which of the four reading-status buckets (radio group)
 *  - Shelf:  which user shelf (or system shelf) to file it under (picker)
 *  - Privacy: per-event visibility (Posture C 4-tier) (radio group)
 *  - Note:   optional free-text body (textarea)
 *
 * Stays presentational: the parent injects the async `onSubmit` handler
 * that calls the eventual `shelf.add` / `shelfItem.create` tRPC mutation.
 */
export function AddSheet({
  visible,
  book,
  shelves,
  initialStatus = "want_to_read",
  initialVisibility = "followers",
  initialShelfId = null,
  initialNote = "",
  onSubmit,
  onCancel,
}: AddSheetProps) {
  const [status, setStatus] = useState<ReadingStatus>(initialStatus);
  const [shelfId, setShelfId] = useState<EntityId | null>(initialShelfId);
  const [visibility, setVisibility] = useState<Visibility>(initialVisibility);
  const [note, setNote] = useState(initialNote);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ status, shelfId, visibility, note: note.trim() });
    } catch {
      setError("Couldn't save. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="overFullScreen"
      transparent
      onRequestClose={onCancel}
    >
      <View style={styles.overlay} testID="add-sheet">
        <View
          style={styles.sheet}
          accessibilityViewIsModal
          accessibilityLabel={`Add ${book.title}`}
        >
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.header}>
              <Text style={styles.title} accessibilityRole="header">
                {`Add "${book.title}"`}
              </Text>
              <TouchableOpacity
                onPress={onCancel}
                accessibilityRole="button"
                accessibilityLabel="Close"
                disabled={submitting}
                style={styles.close}
              >
                <Text style={styles.closeLabel}>×</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.field} accessibilityLabel="Reading status">
              <Text style={styles.legend}>Status</Text>
              <View
                style={styles.radioGroup}
                accessibilityRole="radiogroup"
                accessibilityLabel="Reading status"
              >
                {STATUS_OPTIONS.map((opt) => {
                  const active = status === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={active ? styles.radioActive : styles.radio}
                      onPress={() => setStatus(opt.value)}
                      disabled={submitting}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={opt.label}
                      testID={`add-sheet-status-${opt.value}`}
                    >
                      <Text style={active ? styles.radioLabelActive : styles.radioLabel}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.legend}>Shelf</Text>
              <View
                style={styles.radioGroup}
                accessibilityRole="radiogroup"
                accessibilityLabel="Shelf"
                testID="add-sheet-shelf"
              >
                <TouchableOpacity
                  style={shelfId === null ? styles.radioActive : styles.radio}
                  onPress={() => setShelfId(null)}
                  disabled={submitting}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: shelfId === null }}
                  accessibilityLabel="No specific shelf"
                  testID="add-sheet-shelf-none"
                >
                  <Text
                    style={
                      shelfId === null ? styles.radioLabelActive : styles.radioLabel
                    }
                  >
                    No specific shelf
                  </Text>
                </TouchableOpacity>
                {shelves.map((s) => {
                  const active = shelfId === s.id;
                  const label = s.isSystem ? `${s.name} (system)` : s.name;
                  return (
                    <TouchableOpacity
                      key={s.id}
                      style={active ? styles.radioActive : styles.radio}
                      onPress={() => setShelfId(s.id)}
                      disabled={submitting}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={label}
                      testID={`add-sheet-shelf-${s.id}`}
                    >
                      <Text
                        style={active ? styles.radioLabelActive : styles.radioLabel}
                      >
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.field} accessibilityLabel="Privacy">
              <Text style={styles.legend}>Privacy</Text>
              <View
                style={styles.radioGroup}
                accessibilityRole="radiogroup"
                accessibilityLabel="Privacy"
              >
                {VISIBILITY_OPTIONS.map((opt) => {
                  const active = visibility === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={active ? styles.privacyActive : styles.privacy}
                      onPress={() => setVisibility(opt.value)}
                      disabled={submitting}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={`${opt.label}: ${opt.hint}`}
                      testID={`add-sheet-visibility-${opt.value}`}
                    >
                      <Text
                        style={
                          active ? styles.privacyLabelActive : styles.privacyLabel
                        }
                      >
                        {opt.label}
                      </Text>
                      <Text style={styles.privacyHint}>{opt.hint}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.legend}>Note</Text>
              <TextInput
                style={styles.note}
                value={note}
                onChangeText={setNote}
                placeholder="Optional — for your eyes only on Want to read / Reading."
                placeholderTextColor="#9B927D"
                multiline
                numberOfLines={4}
                editable={!submitting}
                accessibilityLabel="Note"
                testID="add-sheet-note"
              />
            </View>

            {error ? (
              <Text
                style={styles.error}
                accessibilityRole="alert"
                testID="add-sheet-error"
              >
                {error}
              </Text>
            ) : null}

            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.cancel}
                onPress={onCancel}
                disabled={submitting}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                testID="add-sheet-cancel"
              >
                <Text style={styles.cancelLabel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.save, submitting && styles.saveDisabled]}
                onPress={handleSubmit}
                disabled={submitting}
                accessibilityRole="button"
                accessibilityLabel="Save"
                testID="add-sheet-save"
              >
                <Text style={styles.saveLabel}>
                  {submitting ? "Saving…" : "Save"}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(23, 20, 17, 0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#F7F4ED",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "92%",
  },
  scrollContent: {
    padding: 18,
    gap: 16,
    paddingBottom: 36,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  title: {
    color: "#181512",
    flex: 1,
    fontFamily: "serif",
    fontSize: 20,
    fontWeight: "600",
    lineHeight: 26,
  },
  close: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  closeLabel: {
    color: "#676158",
    fontSize: 26,
    lineHeight: 28,
  },
  field: {
    gap: 8,
  },
  legend: {
    color: "#181512",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  radioGroup: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  radio: {
    backgroundColor: "#FBFAF6",
    borderColor: "#E5DFD3",
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  radioActive: {
    backgroundColor: "#253F5B",
    borderColor: "#253F5B",
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  radioLabel: {
    color: "#181512",
    fontSize: 13,
    fontWeight: "600",
  },
  radioLabelActive: {
    color: "#F7F4ED",
    fontSize: 13,
    fontWeight: "700",
  },
  privacy: {
    backgroundColor: "#FBFAF6",
    borderColor: "#E5DFD3",
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  privacyActive: {
    backgroundColor: "#253F5B",
    borderColor: "#253F5B",
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  privacyLabel: {
    color: "#181512",
    fontSize: 13,
    fontWeight: "700",
  },
  privacyLabelActive: {
    color: "#F7F4ED",
    fontSize: 13,
    fontWeight: "700",
  },
  privacyHint: {
    color: "#676158",
    fontSize: 11,
  },
  note: {
    backgroundColor: "#FBFAF6",
    borderColor: "#E5DFD3",
    borderRadius: 6,
    borderWidth: 1,
    color: "#181512",
    fontSize: 14,
    minHeight: 84,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: "top",
  },
  error: {
    color: "#B9472D",
    fontSize: 13,
    lineHeight: 18,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
    marginTop: 6,
  },
  cancel: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  cancelLabel: {
    color: "#181512",
    fontSize: 14,
    fontWeight: "600",
  },
  save: {
    backgroundColor: "#253F5B",
    borderRadius: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  saveDisabled: {
    opacity: 0.55,
  },
  saveLabel: {
    color: "#F7F4ED",
    fontSize: 14,
    fontWeight: "700",
  },
});
