import type { ParseAndMatchResult, CommitResult } from "./types";

/**
 * State machine for the /import flow. Discriminated union — each state
 * carries exactly the data the matching step renders. Keeping it explicit
 * (rather than e.g. a single `phase` string with a god-object payload)
 * makes the UploadStep / ReviewStep / ConfirmStep components able to
 * narrow on `state.phase` without optional-chaining everything.
 *
 * Allowed transitions (validated by {@link transition}):
 *   idle      → uploading           (user picks a CSV)
 *   uploading → matching | error    (file read OK / I/O error)
 *   matching  → review | error      (backend returns / throws)
 *   review    → committing | idle   (user hits commit / starts over)
 *   committing → done | error
 *   done      → idle                (user uploads another file)
 *   error     → idle                (user retries)
 *
 * Any other input is a no-op and returns the prior state, which matches
 * the conservative "don't lose user progress on a stray event" policy
 * the onboarding step machine (#142 vintage) uses.
 */
export type ImportState =
  | { phase: "idle" }
  | { phase: "uploading"; fileName: string }
  | { phase: "matching"; fileName: string }
  | { phase: "review"; fileName: string; result: ParseAndMatchResult }
  | {
      phase: "committing";
      fileName: string;
      result: ParseAndMatchResult;
    }
  | { phase: "done"; fileName: string; summary: CommitResult }
  | { phase: "error"; fileName: string | null; message: string };

export type ImportEvent =
  | { type: "pick_file"; fileName: string }
  | { type: "begin_matching" }
  | { type: "matched"; result: ParseAndMatchResult }
  | { type: "begin_commit" }
  | { type: "committed"; summary: CommitResult }
  | { type: "fail"; message: string }
  | { type: "reset" };

export const INITIAL_IMPORT_STATE: ImportState = { phase: "idle" };

/**
 * Pure reducer. Out-of-band transitions return the prior state unchanged
 * — the caller is free to log a warning, but the user doesn't get bounced
 * into an inconsistent screen.
 */
export function transition(
  state: ImportState,
  event: ImportEvent,
): ImportState {
  switch (event.type) {
    case "pick_file":
      if (state.phase === "idle" || state.phase === "error" || state.phase === "done") {
        return { phase: "uploading", fileName: event.fileName };
      }
      return state;
    case "begin_matching":
      if (state.phase === "uploading") {
        return { phase: "matching", fileName: state.fileName };
      }
      return state;
    case "matched":
      if (state.phase === "matching") {
        return {
          phase: "review",
          fileName: state.fileName,
          result: event.result,
        };
      }
      return state;
    case "begin_commit":
      if (state.phase === "review") {
        return {
          phase: "committing",
          fileName: state.fileName,
          result: state.result,
        };
      }
      return state;
    case "committed":
      if (state.phase === "committing") {
        return {
          phase: "done",
          fileName: state.fileName,
          summary: event.summary,
        };
      }
      return state;
    case "fail": {
      const fileName =
        state.phase === "idle" || state.phase === "error"
          ? state.phase === "error"
            ? state.fileName
            : null
          : state.fileName;
      return { phase: "error", fileName, message: event.message };
    }
    case "reset":
      return INITIAL_IMPORT_STATE;
  }
}

/**
 * Convenience selector: maps a state to the user-facing progress label.
 * Kept here so both the live UI and the progress-machine tests can assert
 * the same copy.
 */
export function progressLabel(state: ImportState): string {
  switch (state.phase) {
    case "idle":
      return "Pick a Goodreads CSV to begin.";
    case "uploading":
      return "Uploading…";
    case "matching":
      return "Matching books…";
    case "review":
      return "Ready for review.";
    case "committing":
      return "Committing import…";
    case "done":
      return "Import complete.";
    case "error":
      return "Import failed.";
  }
}
