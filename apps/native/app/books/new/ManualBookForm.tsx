import { useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  MAX_AUTHORS,
  MAX_AUTHOR_LEN,
  MAX_TITLE_LEN,
  validateManualBookState,
  type FieldErrors,
  type ManualBookSubmission,
} from "./validateManualBookState";

export type { ManualBookSubmission, FieldErrors } from "./validateManualBookState";

export interface ManualBookFormProps {
  /**
   * Called when the viewer submits a valid form. Should call the eventual
   * `books.createManual` tRPC mutation. Errors thrown (e.g. server 400)
   * are caught and surfaced inline as a top-level error.
   */
  onSubmit: (submission: ManualBookSubmission) => Promise<void>;
  /** Initial title (useful for tests / SSR rehydration). */
  initialTitle?: string;
  /** Initial authors. At least one entry; blank entries are scrubbed at submit. */
  initialAuthors?: ReadonlyArray<string>;
  /** Initial ISBN (raw — hyphens / spaces tolerated). */
  initialIsbn?: string;
  /** Initial publication year. */
  initialYear?: string;
  /** Initial cover URL. */
  initialCoverUrl?: string;
}

/**
 * Manual book creation form (G-06, #80) for the native app.
 *
 * Native parity with `apps/web/app/books/new/ManualBookForm.tsx` (#79):
 * same field set (title, authors[], optional ISBN, year, cover URL),
 * same validator (`validateManualBookState` ported into a react-native
 * free sibling module), and the same submission shape so it lines up
 * 1:1 with `books.createManual` (#75) once a native tRPC client lands.
 *
 * Built from React Native primitives only — no web HTML. The parent
 * injects `onSubmit` so the screen can swap the stub
 * `submitManualBook` shim for a tRPC mutation without changing this
 * component.
 */
export function ManualBookForm({
  onSubmit,
  initialTitle = "",
  initialAuthors = [""],
  initialIsbn = "",
  initialYear = "",
  initialCoverUrl = "",
}: ManualBookFormProps) {
  const [title, setTitle] = useState(initialTitle);
  const [authors, setAuthors] = useState<string[]>(
    initialAuthors.length > 0 ? [...initialAuthors] : [""],
  );
  const [isbn, setIsbn] = useState(initialIsbn);
  const [year, setYear] = useState(initialYear);
  const [coverUrl, setCoverUrl] = useState(initialCoverUrl);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const titleTrimmed = title.trim();
  const nonBlankAuthors = authors.map((a) => a.trim()).filter((a) => a !== "");
  const isFormFillable = titleTrimmed.length > 0 && nonBlankAuthors.length > 0;

  function setAuthorAt(index: number, value: string): void {
    setAuthors((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  function addAuthor(): void {
    if (authors.length >= MAX_AUTHORS) return;
    setAuthors((prev) => [...prev, ""]);
  }

  function removeAuthor(index: number): void {
    setAuthors((prev) => {
      if (prev.length <= 1) return [""];
      return prev.filter((_, i) => i !== index);
    });
  }

  async function handleSubmit(): Promise<void> {
    if (submitting) return;
    setServerError(null);

    const result = validateManualBookState({
      title,
      authors,
      isbn,
      year,
      coverUrl,
    });
    setFieldErrors(result.errors);
    if (!result.ok || !result.payload) return;

    setSubmitting(true);
    try {
      await onSubmit(result.payload);
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : "Couldn't save the book. Please try again.";
      setServerError(message);
    } finally {
      setSubmitting(false);
    }
  }

  const submitDisabled = submitting || !isFormFillable;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      testID="manual-book-form"
      accessibilityLabel="Add a book manually"
    >
      <Text style={styles.title} accessibilityRole="header">
        Add a book manually
      </Text>
      <Text style={styles.hint}>
        Use this if your book isn&rsquo;t in the catalog. Title and at least
        one author are required.
      </Text>

      <View style={styles.field}>
        <Text style={styles.label}>Title *</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          editable={!submitting}
          maxLength={MAX_TITLE_LEN}
          accessibilityLabel="Title"
          testID="manual-book-title"
        />
        {fieldErrors.title ? (
          <Text
            style={styles.error}
            accessibilityRole="alert"
            testID="manual-book-title-error"
          >
            {fieldErrors.title}
          </Text>
        ) : null}
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Authors *</Text>
        {authors.map((author, idx) => (
          <View key={idx} style={styles.authorRow}>
            <TextInput
              style={styles.authorInput}
              value={author}
              onChangeText={(v) => setAuthorAt(idx, v)}
              editable={!submitting}
              maxLength={MAX_AUTHOR_LEN}
              accessibilityLabel={`Author ${idx + 1}`}
              testID={`manual-book-author-${idx}`}
            />
            {authors.length > 1 ? (
              <TouchableOpacity
                style={styles.authorRemove}
                onPress={() => removeAuthor(idx)}
                disabled={submitting}
                accessibilityRole="button"
                accessibilityLabel={`Remove author ${idx + 1}`}
                testID={`manual-book-author-remove-${idx}`}
              >
                <Text style={styles.authorRemoveLabel}>×</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ))}
        <TouchableOpacity
          style={[
            styles.authorAdd,
            (submitting || authors.length >= MAX_AUTHORS) && styles.disabled,
          ]}
          onPress={addAuthor}
          disabled={submitting || authors.length >= MAX_AUTHORS}
          accessibilityRole="button"
          accessibilityLabel="Add author"
          testID="manual-book-author-add"
        >
          <Text style={styles.authorAddLabel}>+ Add author</Text>
        </TouchableOpacity>
        {fieldErrors.authors ? (
          <Text
            style={styles.error}
            accessibilityRole="alert"
            testID="manual-book-authors-error"
          >
            {fieldErrors.authors}
          </Text>
        ) : null}
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>ISBN (optional)</Text>
        <TextInput
          style={styles.input}
          value={isbn}
          onChangeText={setIsbn}
          editable={!submitting}
          keyboardType="numeric"
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="ISBN"
          testID="manual-book-isbn"
        />
        {fieldErrors.isbn ? (
          <Text
            style={styles.error}
            accessibilityRole="alert"
            testID="manual-book-isbn-error"
          >
            {fieldErrors.isbn}
          </Text>
        ) : null}
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Publication year (optional)</Text>
        <TextInput
          style={styles.input}
          value={year}
          onChangeText={setYear}
          editable={!submitting}
          keyboardType="numeric"
          accessibilityLabel="Publication year"
          testID="manual-book-year"
        />
        {fieldErrors.year ? (
          <Text
            style={styles.error}
            accessibilityRole="alert"
            testID="manual-book-year-error"
          >
            {fieldErrors.year}
          </Text>
        ) : null}
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Cover URL (optional)</Text>
        <TextInput
          style={styles.input}
          value={coverUrl}
          onChangeText={setCoverUrl}
          editable={!submitting}
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="https://"
          placeholderTextColor="#9B927D"
          accessibilityLabel="Cover URL"
          testID="manual-book-cover"
        />
        {fieldErrors.coverUrl ? (
          <Text
            style={styles.error}
            accessibilityRole="alert"
            testID="manual-book-cover-error"
          >
            {fieldErrors.coverUrl}
          </Text>
        ) : null}
      </View>

      {serverError ? (
        <Text
          style={styles.error}
          accessibilityRole="alert"
          testID="manual-book-server-error"
        >
          {serverError}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.submit, submitDisabled && styles.disabled]}
          onPress={handleSubmit}
          disabled={submitDisabled}
          accessibilityRole="button"
          accessibilityLabel="Add book"
          accessibilityState={{ disabled: submitDisabled }}
          testID="manual-book-submit"
        >
          <Text style={styles.submitLabel}>
            {submitting ? "Saving…" : "Add book"}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 18,
    paddingBottom: 36,
    gap: 16,
  },
  title: {
    color: "#181512",
    fontFamily: "serif",
    fontSize: 22,
    fontWeight: "600",
    lineHeight: 28,
  },
  hint: {
    color: "#676158",
    fontSize: 14,
    lineHeight: 20,
  },
  field: {
    gap: 6,
  },
  label: {
    color: "#181512",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  input: {
    backgroundColor: "#FBFAF6",
    borderColor: "#E5DFD3",
    borderRadius: 6,
    borderWidth: 1,
    color: "#181512",
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  authorInput: {
    backgroundColor: "#FBFAF6",
    borderColor: "#E5DFD3",
    borderRadius: 6,
    borderWidth: 1,
    color: "#181512",
    flex: 1,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  authorRemove: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  authorRemoveLabel: {
    color: "#676158",
    fontSize: 22,
    lineHeight: 24,
  },
  authorAdd: {
    alignSelf: "flex-start",
    backgroundColor: "#FBFAF6",
    borderColor: "#E5DFD3",
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  authorAddLabel: {
    color: "#253F5B",
    fontSize: 13,
    fontWeight: "700",
  },
  error: {
    color: "#B9472D",
    fontSize: 13,
    lineHeight: 18,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 6,
  },
  submit: {
    backgroundColor: "#253F5B",
    borderRadius: 6,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  submitLabel: {
    color: "#F7F4ED",
    fontSize: 14,
    fontWeight: "700",
  },
  disabled: {
    opacity: 0.55,
  },
});
