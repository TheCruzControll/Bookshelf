"use client";

import { useMemo } from "react";
import type {
  ImportReviewRow,
  ReviewBucket,
  RowDecisionMap,
} from "./types";

export interface ReviewStepProps {
  rows: ReadonlyArray<ImportReviewRow>;
  decisions: RowDecisionMap;
  onDecisionChange: (rowId: string, next: Partial<{
    apply: boolean;
    overwriteConflict: boolean;
  }>) => void;
  onContinue: () => void;
  onCancel: () => void;
}

/**
 * Ordering matches the spec (`docs/search-add-flow-spec.md` § Goodreads
 * CSV Import) plus the implementer brief: the user sees matched first
 * (the happy path), then needs_review, then conflicts, then unmatched.
 */
const BUCKET_ORDER: ReadonlyArray<ReviewBucket> = [
  "matched",
  "needs_review",
  "conflict",
  "unmatched",
];

const BUCKET_TITLE: Record<ReviewBucket, string> = {
  matched: "Matched",
  needs_review: "Needs review",
  conflict: "Conflict",
  unmatched: "Unmatched",
};

const BUCKET_HELP: Record<ReviewBucket, string> = {
  matched:
    "Auto-applied. Uncheck any row you'd rather skip from this import.",
  needs_review:
    "We found a likely candidate but it's not a definite match. Confirm to include.",
  conflict:
    "These books are already on a Hone shelf with a different status. Default is to keep Hone's status; tick the override to overwrite from Goodreads. Duplicate rows (same status both sides) are always skipped.",
  unmatched:
    "We couldn't find these in the catalog. You can create them manually after the import.",
};

function statusLabel(value: string): string {
  return value.replace(/_/g, " ");
}

interface BucketSectionProps {
  bucket: ReviewBucket;
  rows: ReadonlyArray<ImportReviewRow>;
  decisions: RowDecisionMap;
  onDecisionChange: ReviewStepProps["onDecisionChange"];
}

function BucketSection({
  bucket,
  rows,
  decisions,
  onDecisionChange,
}: BucketSectionProps) {
  return (
    <section
      className={`importBucketSection importBucketSection-${bucket}`}
      data-testid={`import-bucket-${bucket}`}
      aria-labelledby={`import-bucket-${bucket}-heading`}
    >
      <header className="importBucketHeader">
        <h3
          id={`import-bucket-${bucket}-heading`}
          className="importBucketTitle"
        >
          {BUCKET_TITLE[bucket]}{" "}
          <span
            className="importBucketCount"
            data-testid={`import-bucket-${bucket}-count`}
          >
            ({rows.length})
          </span>
        </h3>
        <p className="importBucketHelp">{BUCKET_HELP[bucket]}</p>
      </header>
      {rows.length === 0 ? (
        <p className="importBucketEmpty">No rows in this bucket.</p>
      ) : (
        <ul className="importBucketList" role="list">
          {rows.map((row) => {
            const decision = decisions[row.rowId] ?? {
              apply: false,
              overwriteConflict: false,
            };
            return (
              <li
                key={row.rowId}
                className="importBucketRow"
                data-testid={`import-row-${row.rowId}`}
              >
                <div className="importBucketRowBody">
                  <p className="importBucketRowTitle">
                    <strong>{row.title}</strong> &mdash; {row.author}
                  </p>
                  <p className="importBucketRowMeta">
                    Goodreads status:{" "}
                    <span data-testid={`import-row-${row.rowId}-status`}>
                      {statusLabel(row.goodreadsStatus)}
                    </span>
                  </p>
                  {row.candidateTitle ? (
                    <p className="importBucketRowMeta">
                      Did you mean:{" "}
                      <em>{row.candidateTitle}</em>
                      {row.candidateAuthor ? ` — ${row.candidateAuthor}` : ""}?
                    </p>
                  ) : null}
                  {row.currentHoneStatus ? (
                    <p className="importBucketRowMeta">
                      Currently on Hone as:{" "}
                      <em
                        data-testid={`import-row-${row.rowId}-current-status`}
                      >
                        {statusLabel(row.currentHoneStatus)}
                      </em>
                    </p>
                  ) : null}
                  {row.isDuplicate ? (
                    <p className="importBucketRowMeta importBucketRowMetaMuted">
                      Duplicate of an existing entry; this row will be
                      skipped.
                    </p>
                  ) : null}
                </div>
                <div className="importBucketRowControls">
                  {bucket === "unmatched" ? (
                    <a
                      className="importBucketRowCreateManual"
                      href={`/search?manual=1&q=${encodeURIComponent(
                        `${row.title} ${row.author}`.trim(),
                      )}`}
                      data-testid={`import-row-${row.rowId}-create-manual`}
                    >
                      Create manually
                    </a>
                  ) : (
                    <label className="importBucketRowApply">
                      <input
                        type="checkbox"
                        checked={decision.apply}
                        onChange={(e) =>
                          onDecisionChange(row.rowId, {
                            apply: e.target.checked,
                          })
                        }
                        disabled={row.isDuplicate === true}
                        data-testid={`import-row-${row.rowId}-apply`}
                      />
                      Include in import
                    </label>
                  )}
                  {bucket === "conflict" && row.isDuplicate !== true ? (
                    <label className="importBucketRowOverride">
                      <input
                        type="checkbox"
                        checked={decision.overwriteConflict}
                        onChange={(e) =>
                          onDecisionChange(row.rowId, {
                            overwriteConflict: e.target.checked,
                          })
                        }
                        data-testid={`import-row-${row.rowId}-overwrite`}
                      />
                      Overwrite Hone status with Goodreads
                    </label>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/**
 * Step 3 of the import flow. Splits the parsed rows into the four buckets
 * called out in the AC (matched / needs_review / conflict / unmatched).
 * The K-06 `duplicate` sub-bucket is folded into `conflict` per the
 * implementer brief so the user still sees one section per AC item.
 */
export function ReviewStep({
  rows,
  decisions,
  onDecisionChange,
  onContinue,
  onCancel,
}: ReviewStepProps) {
  const grouped = useMemo(() => {
    const out: Record<ReviewBucket, ImportReviewRow[]> = {
      matched: [],
      needs_review: [],
      conflict: [],
      unmatched: [],
    };
    for (const row of rows) out[row.bucket].push(row);
    return out;
  }, [rows]);

  return (
    <div className="importReviewStep" data-testid="import-review-step">
      <header className="importStepHeader">
        <h2 className="importStepTitle">Review your import</h2>
        <p className="importStepDescription">
          {rows.length} row{rows.length === 1 ? "" : "s"} parsed. Confirm
          what you'd like to add to Hone, then continue.
        </p>
      </header>
      {BUCKET_ORDER.map((bucket) => (
        <BucketSection
          key={bucket}
          bucket={bucket}
          rows={grouped[bucket]}
          decisions={decisions}
          onDecisionChange={onDecisionChange}
        />
      ))}
      <div className="importReviewActions">
        <button
          type="button"
          className="importReviewCancel"
          onClick={onCancel}
          data-testid="import-review-cancel"
        >
          Start over
        </button>
        <button
          type="button"
          className="importReviewContinue"
          onClick={onContinue}
          data-testid="import-review-continue"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

export const __testing = { BUCKET_ORDER, BUCKET_TITLE };
