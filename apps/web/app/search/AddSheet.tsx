"use client";

import { useState } from "react";
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

const VISIBILITY_OPTIONS: { value: Visibility; label: string; hint: string }[] = [
  { value: "public", label: "Public", hint: "Anyone on the internet" },
  { value: "followers", label: "Followers", hint: "People who follow you" },
  { value: "mutuals", label: "Mutuals", hint: "Followers you follow back" },
  { value: "private", label: "Private", hint: "Only you" },
];

/**
 * The Add Sheet (G-02, #76) opened when a viewer selects a result on
 * /search. Collects the four inputs called out in the AC:
 *  - Status: which of the four reading-status buckets
 *  - Shelf:  which user shelf (or system shelf) to file it under
 *  - Privacy: per-event visibility (Posture C 4-tier)
 *  - Note:   optional free-text body
 *
 * Stays presentational: the parent injects the async `onSubmit` handler
 * that calls the eventual `shelf.add` / `shelfItem.create` tRPC mutation.
 */
export function AddSheet({
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
    <div
      className="addSheetOverlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-sheet-title"
      data-testid="add-sheet"
    >
      <form className="addSheet" onSubmit={handleSubmit}>
        <header className="addSheetHeader">
          <h2 id="add-sheet-title" className="addSheetTitle">
            Add &ldquo;{book.title}&rdquo;
          </h2>
          <button
            type="button"
            className="addSheetClose"
            onClick={onCancel}
            aria-label="Close"
            disabled={submitting}
          >
            ×
          </button>
        </header>

        <fieldset
          className="addSheetField addSheetStatusGroup"
          aria-label="Reading status"
        >
          <legend className="addSheetFieldLegend">Status</legend>
          <div role="radiogroup" aria-label="Reading status">
            {STATUS_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={
                  "addSheetStatusOption" +
                  (status === opt.value ? " addSheetStatusOptionActive" : "")
                }
              >
                <input
                  type="radio"
                  name="add-sheet-status"
                  value={opt.value}
                  checked={status === opt.value}
                  onChange={() => setStatus(opt.value)}
                  disabled={submitting}
                  data-testid={`add-sheet-status-${opt.value}`}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="addSheetField">
          <label className="addSheetFieldLegend" htmlFor="add-sheet-shelf">
            Shelf
          </label>
          <select
            id="add-sheet-shelf"
            className="addSheetShelfSelect"
            value={shelfId ?? ""}
            onChange={(e) =>
              setShelfId(e.target.value === "" ? null : (e.target.value as EntityId))
            }
            disabled={submitting}
            data-testid="add-sheet-shelf"
          >
            <option value="">No specific shelf</option>
            {shelves.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.isSystem ? " (system)" : ""}
              </option>
            ))}
          </select>
        </div>

        <fieldset className="addSheetField" aria-label="Privacy">
          <legend className="addSheetFieldLegend">Privacy</legend>
          <div role="radiogroup" aria-label="Privacy">
            {VISIBILITY_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={
                  "addSheetPrivacyOption" +
                  (visibility === opt.value ? " addSheetPrivacyOptionActive" : "")
                }
              >
                <input
                  type="radio"
                  name="add-sheet-visibility"
                  value={opt.value}
                  checked={visibility === opt.value}
                  onChange={() => setVisibility(opt.value)}
                  disabled={submitting}
                  data-testid={`add-sheet-visibility-${opt.value}`}
                />
                <span className="addSheetPrivacyOptionLabel">{opt.label}</span>
                <span className="addSheetPrivacyOptionHint">{opt.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="addSheetField">
          <label className="addSheetFieldLegend" htmlFor="add-sheet-note">
            Note
          </label>
          <textarea
            id="add-sheet-note"
            className="addSheetNote"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional — for your eyes only on Want to read / Reading."
            rows={4}
            disabled={submitting}
            data-testid="add-sheet-note"
          />
        </div>

        {error ? (
          <p className="addSheetError" role="alert">
            {error}
          </p>
        ) : null}

        <div className="addSheetActions">
          <button
            type="button"
            className="addSheetCancel"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="addSheetSave"
            disabled={submitting}
            data-testid="add-sheet-save"
          >
            {submitting ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
