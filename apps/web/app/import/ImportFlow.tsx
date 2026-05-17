"use client";

import { useCallback, useMemo, useReducer, useState } from "react";
import { UploadStep } from "./UploadStep";
import { ReviewStep } from "./ReviewStep";
import { ConfirmStep } from "./ConfirmStep";
import {
  INITIAL_IMPORT_STATE,
  progressLabel,
  transition,
} from "./state";
import { STUB_IMPORT_BACKEND } from "./stubBackend";
import type {
  ImportBackend,
  ImportReviewRow,
  RowDecisionMap,
  RowDecision,
} from "./types";

export interface ImportFlowProps {
  /**
   * Backend bound to the eventual tRPC client. Defaults to
   * {@link STUB_IMPORT_BACKEND} so the page (RSC) doesn't have to pass
   * a function across the server/client boundary (Next.js forbids it).
   */
  backend?: ImportBackend;
}

/**
 * Decide the default per-row apply / overwrite flags from the spec:
 *   - `matched`      → apply: true,  overwrite: false
 *   - `needs_review` → apply: false, overwrite: false (user must confirm)
 *   - `conflict`     → apply: false, overwrite: false (keep Hone wins)
 *   - `unmatched`    → apply: false, overwrite: false (linked out to /search)
 *
 * Duplicate rows (K-06) are always `apply: false` because the committer
 * skips them regardless.
 */
function buildInitialDecisions(
  rows: ReadonlyArray<ImportReviewRow>,
): RowDecisionMap {
  const out: Record<string, RowDecision> = {};
  for (const row of rows) {
    out[row.rowId] = {
      apply: row.bucket === "matched" && row.isDuplicate !== true,
      overwriteConflict: false,
    };
  }
  return out;
}

/**
 * Substep within the review/confirm phases. Distinct from the state
 * machine phase because both the review screen and the confirm screen
 * sit on the same `review` state value — the user can flip between them
 * locally without affecting upstream upload/match progress.
 */
type ReviewSubstep = "review" | "confirm";

/**
 * Multi-step orchestrator for the /import flow (K-07):
 *   1. UploadStep    — file picker, accepts `.csv`.
 *   2. progress UI   — "Uploading…", "Matching…", "Ready for review".
 *   3. ReviewStep    — four bucket sections, per-row toggles.
 *   4. ConfirmStep   — summary + Commit button → `backend.commit`.
 *
 * The state machine in {@link transition} is the single source of truth
 * for which step is visible; per-row decisions live in component state
 * because they're cheap and only matter during review/confirm.
 */
export function ImportFlow({
  backend = STUB_IMPORT_BACKEND,
}: ImportFlowProps) {
  const [state, dispatch] = useReducer(transition, INITIAL_IMPORT_STATE);
  const [decisions, setDecisions] = useState<RowDecisionMap>({});
  const [substep, setSubstep] = useState<ReviewSubstep>("review");

  const handleFilePicked = useCallback(
    async (file: File) => {
      dispatch({ type: "pick_file", fileName: file.name });
      try {
        const csv = await file.text();
        dispatch({ type: "begin_matching" });
        const result = await backend.parseAndMatch(csv);
        setDecisions(buildInitialDecisions(result.rows));
        setSubstep("review");
        dispatch({ type: "matched", result });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Could not read the file.";
        dispatch({ type: "fail", message });
      }
    },
    [backend],
  );

  const handleDecisionChange = useCallback(
    (
      rowId: string,
      next: Partial<{ apply: boolean; overwriteConflict: boolean }>,
    ) => {
      setDecisions((prev) => {
        const existing: RowDecision = prev[rowId] ?? {
          apply: false,
          overwriteConflict: false,
        };
        return {
          ...prev,
          [rowId]: {
            apply: next.apply ?? existing.apply,
            overwriteConflict:
              next.overwriteConflict ?? existing.overwriteConflict,
          },
        };
      });
    },
    [],
  );

  const handleReset = useCallback(() => {
    dispatch({ type: "reset" });
    setDecisions({});
    setSubstep("review");
  }, []);

  const handleContinueToConfirm = useCallback(() => {
    setSubstep("confirm");
  }, []);

  const handleBackToReview = useCallback(() => {
    setSubstep("review");
  }, []);

  const handleCommit = useCallback(async () => {
    if (state.phase !== "review") return;
    dispatch({ type: "begin_commit" });
    try {
      const summary = await backend.commit({
        importId: state.result.importId,
        decisions,
      });
      dispatch({ type: "committed", summary });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not commit the import.";
      dispatch({ type: "fail", message });
    }
  }, [backend, state, decisions]);

  const label = useMemo(() => progressLabel(state), [state]);

  return (
    <div className="importFlow" data-testid="import-flow">
      <header className="importFlowHeader">
        <h1 className="importFlowTitle">Import from Goodreads</h1>
        <p
          className="importFlowProgress"
          role="status"
          aria-live="polite"
          data-testid="import-progress-label"
        >
          {label}
        </p>
      </header>

      {state.phase === "idle" ? (
        <UploadStep onFilePicked={handleFilePicked} />
      ) : null}

      {state.phase === "uploading" || state.phase === "matching" ? (
        <div
          className="importProgressStep"
          data-testid="import-progress-step"
          role="status"
          aria-live="polite"
        >
          <p>
            {state.phase === "uploading"
              ? `Uploading ${state.fileName}…`
              : `Matching books in ${state.fileName}…`}
          </p>
          <progress
            className="importProgressIndicator"
            data-testid="import-progress-indicator"
            aria-label={
              state.phase === "uploading" ? "Uploading" : "Matching"
            }
          />
        </div>
      ) : null}

      {state.phase === "review" && substep === "review" ? (
        <ReviewStep
          rows={state.result.rows}
          decisions={decisions}
          onDecisionChange={handleDecisionChange}
          onContinue={handleContinueToConfirm}
          onCancel={handleReset}
        />
      ) : null}

      {state.phase === "review" && substep === "confirm" ? (
        <ConfirmStep
          rows={state.result.rows}
          decisions={decisions}
          submitting={false}
          onSubmit={handleCommit}
          onBack={handleBackToReview}
        />
      ) : null}

      {state.phase === "committing" ? (
        <ConfirmStep
          rows={state.result.rows}
          decisions={decisions}
          submitting={true}
          onSubmit={handleCommit}
          onBack={handleBackToReview}
        />
      ) : null}

      {state.phase === "done" ? (
        <div className="importDoneStep" data-testid="import-done-step">
          <h2 className="importStepTitle">Import complete</h2>
          <p>
            {state.summary.appliedCount} row
            {state.summary.appliedCount === 1 ? "" : "s"} added,{" "}
            {state.summary.skippedCount} skipped.
          </p>
          <button
            type="button"
            className="importDoneRestart"
            onClick={handleReset}
            data-testid="import-done-restart"
          >
            Import another file
          </button>
        </div>
      ) : null}

      {state.phase === "error" ? (
        <div
          className="importErrorStep"
          data-testid="import-error-step"
          role="alert"
        >
          <h2 className="importStepTitle">Something went wrong</h2>
          <p>{state.message}</p>
          <button
            type="button"
            className="importErrorRestart"
            onClick={handleReset}
            data-testid="import-error-restart"
          >
            Try again
          </button>
        </div>
      ) : null}
    </div>
  );
}
