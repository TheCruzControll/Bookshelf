"use client";

import { useCallback, useState } from "react";

export type StarBucket = 1 | 2 | 3 | 4 | 5;

export interface RankingBucketModalProps {
  /** Title of the book being ranked. */
  bookTitle: string;
  /** Called with the chosen 1-5 star bucket. */
  onSelect: (bucket: StarBucket) => Promise<void> | void;
  /** Optional handler for cancelling the flow before bucket selection. */
  onCancel?: () => void;
  /** Optional initial selection (e.g. resuming a flow). */
  initialBucket?: StarBucket;
}

const ALL_BUCKETS: StarBucket[] = [1, 2, 3, 4, 5];

/**
 * First step of the ranking flow per docs/ranking-flow-spec.md.
 *
 * Bucket maps to a starting score range used to seed the binary search:
 *   5★ → 8.00–10.00, 4★ → 6.00–8.00, …, 1★ → 0.00–2.00.
 * The bucket is private metadata — never shown after submission.
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
    <div
      className="rankingModal"
      role="dialog"
      aria-modal="true"
      aria-label="Choose star bucket"
    >
      <h2 className="rankingModalTitle">How was {bookTitle}?</h2>
      <p className="rankingModalHint">Pick a starting bucket; comparisons will refine it.</p>

      <div className="rankingBucketRow" role="radiogroup" aria-label="Star bucket">
        {ALL_BUCKETS.map((b) => (
          <button
            key={b}
            type="button"
            role="radio"
            aria-checked={selected === b}
            aria-label={`${b} ${b === 1 ? "star" : "stars"}`}
            className={
              selected === b ? "rankingBucketStarSelected" : "rankingBucketStar"
            }
            onClick={() => setSelected(b)}
            disabled={submitting}
          >
            {"★".repeat(b)}
          </button>
        ))}
      </div>

      <div className="rankingModalActions">
        {onCancel ? (
          <button
            type="button"
            className="rankingModalCancel"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </button>
        ) : null}
        <button
          type="button"
          className="rankingModalSubmit"
          onClick={handleSubmit}
          disabled={selected === null || submitting}
        >
          {submitting ? "Submitting…" : "Next"}
        </button>
      </div>
    </div>
  );
}
