"use client";

import { useState, useCallback } from "react";
import { RankingBucketModal } from "./RankingBucketModal";
import { RankingComparisonModal } from "./RankingComparisonModal";
import { RankingScorePopup } from "./RankingScorePopup";
import type { StarBucket } from "./RankingBucketModal";
import type { ComparisonBook } from "./RankingComparisonModal";

export interface RankingFlowProps {
  /** The new book being ranked. */
  newBook: ComparisonBook;
  /** Whether the viewer's scores are currently unlocked. */
  scoresUnlocked: boolean;
  /** Total finished books *after* the in-flight placement is saved. */
  finishedCountAfterSave: number;

  /** Called when the bucket step completes. The server uses it to seed the binary search. */
  onBucketChosen: (bucket: StarBucket) => Promise<{ next: ComparisonBook | null }>;
  /**
   * Called when the user picks one side of a comparison. The server runs
   * one step of the binary search and either returns the next
   * comparison book or `null` when placement has converged. When
   * convergence happens the server also returns the derived score.
   */
  onComparisonPicked: (
    choice: "new" | "existing",
  ) => Promise<{ next: ComparisonBook | null; finalScore: number | null }>;
  /** Called when the user closes the final popup. */
  onClose: () => void;

  /** Optional review/note the user attached during the flow. */
  note?: string;
}

type Stage =
  | { kind: "bucket" }
  | { kind: "comparison"; existing: ComparisonBook }
  | { kind: "score"; score: number };

/**
 * Orchestrates the modal sequence per docs/ranking-flow-spec.md:
 *   bucket → comparison → score.
 *
 * Stays presentational — the parent injects async handlers that talk
 * to the server tRPC procedures (`ranking.startBucket`, `ranking.compare`,
 * etc.). Score-unlock state is forwarded into each sub-modal.
 */
export function RankingFlow({
  newBook,
  scoresUnlocked,
  finishedCountAfterSave,
  onBucketChosen,
  onComparisonPicked,
  onClose,
  note,
}: RankingFlowProps) {
  const [stage, setStage] = useState<Stage>({ kind: "bucket" });

  const handleBucket = useCallback(
    async (bucket: StarBucket) => {
      const { next } = await onBucketChosen(bucket);
      if (next) {
        setStage({ kind: "comparison", existing: next });
      } else {
        // Empty library: derived score with no comparisons.
        setStage({ kind: "score", score: 10 });
      }
    },
    [onBucketChosen],
  );

  const handlePick = useCallback(
    async (choice: "new" | "existing") => {
      const { next, finalScore } = await onComparisonPicked(choice);
      if (next && finalScore === null) {
        setStage({ kind: "comparison", existing: next });
      } else if (finalScore !== null) {
        setStage({ kind: "score", score: finalScore });
      }
    },
    [onComparisonPicked],
  );

  if (stage.kind === "bucket") {
    return (
      <RankingBucketModal
        bookTitle={newBook.title}
        onSelect={handleBucket}
      />
    );
  }
  if (stage.kind === "comparison") {
    return (
      <RankingComparisonModal
        newBook={newBook}
        existingBook={stage.existing}
        scoresUnlocked={scoresUnlocked}
        onPick={handlePick}
      />
    );
  }
  // stage.kind === "score"
  const popupProps: Parameters<typeof RankingScorePopup>[0] = {
    bookTitle: newBook.title,
    score: stage.score,
    finishedCount: finishedCountAfterSave,
    onClose,
  };
  if (note !== undefined) popupProps.note = note;
  return <RankingScorePopup {...popupProps} />;
}
