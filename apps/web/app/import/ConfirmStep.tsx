"use client";

import { useMemo } from "react";
import type {
  ImportReviewRow,
  RowDecisionMap,
} from "./types";

export interface ConfirmStepProps {
  rows: ReadonlyArray<ImportReviewRow>;
  decisions: RowDecisionMap;
  submitting: boolean;
  onSubmit: () => void;
  onBack: () => void;
}

/**
 * Tallies what the user is about to commit. Numbers are derived from
 * (row, decision) pairs so the summary updates whenever the user toggles
 * a row's `apply`/`overwriteConflict` flags upstream.
 */
function summarize(
  rows: ReadonlyArray<ImportReviewRow>,
  decisions: RowDecisionMap,
): {
  applied: number;
  skipped: number;
  overwrites: number;
  duplicates: number;
} {
  let applied = 0;
  let skipped = 0;
  let overwrites = 0;
  let duplicates = 0;
  for (const row of rows) {
    if (row.isDuplicate) {
      duplicates += 1;
      skipped += 1;
      continue;
    }
    const decision = decisions[row.rowId];
    if (!decision || !decision.apply) {
      skipped += 1;
      continue;
    }
    applied += 1;
    if (row.bucket === "conflict" && decision.overwriteConflict) {
      overwrites += 1;
    }
  }
  return { applied, skipped, overwrites, duplicates };
}

/**
 * Step 4 of the import flow — final summary + commit. Calls `onSubmit`,
 * which the parent wires to {@link ImportBackend.commit}. The actual
 * commit logic lives server-side and is out of scope for #106 (the stub
 * backend acks with derived counts).
 */
export function ConfirmStep({
  rows,
  decisions,
  submitting,
  onSubmit,
  onBack,
}: ConfirmStepProps) {
  const summary = useMemo(
    () => summarize(rows, decisions),
    [rows, decisions],
  );

  return (
    <div className="importConfirmStep" data-testid="import-confirm-step">
      <h2 className="importStepTitle">Confirm import</h2>
      <p className="importStepDescription">
        Review the final tally below and commit to apply your changes.
      </p>
      <dl className="importConfirmSummary">
        <div className="importConfirmSummaryRow">
          <dt>Will be added</dt>
          <dd data-testid="import-confirm-applied">{summary.applied}</dd>
        </div>
        <div className="importConfirmSummaryRow">
          <dt>Skipped</dt>
          <dd data-testid="import-confirm-skipped">{summary.skipped}</dd>
        </div>
        <div className="importConfirmSummaryRow">
          <dt>Conflicts overwritten</dt>
          <dd data-testid="import-confirm-overwrites">{summary.overwrites}</dd>
        </div>
        <div className="importConfirmSummaryRow">
          <dt>Duplicates (auto-skipped)</dt>
          <dd data-testid="import-confirm-duplicates">{summary.duplicates}</dd>
        </div>
      </dl>
      <div className="importConfirmActions">
        <button
          type="button"
          className="importConfirmBack"
          onClick={onBack}
          disabled={submitting}
          data-testid="import-confirm-back"
        >
          Back to review
        </button>
        <button
          type="button"
          className="importConfirmSubmit"
          onClick={onSubmit}
          disabled={submitting}
          data-testid="import-confirm-submit"
        >
          {submitting ? "Committing…" : "Commit import"}
        </button>
      </div>
    </div>
  );
}

export const __testing = { summarize };
