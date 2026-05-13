import { useCallback, useState } from "react";
import { RankingBucketModal } from "./RankingBucketModal";
import { RankingComparisonModal } from "./RankingComparisonModal";
import { RankingScorePopup } from "./RankingScorePopup";
import type { StarBucket } from "./RankingBucketModal";
import type { ComparisonBook } from "./RankingComparisonModal";

export interface RankingFlowProps {
  newBook: ComparisonBook;
  scoresUnlocked: boolean;
  finishedCountAfterSave: number;
  onBucketChosen: (bucket: StarBucket) => Promise<{ next: ComparisonBook | null }>;
  onComparisonPicked: (
    choice: "new" | "existing",
  ) => Promise<{ next: ComparisonBook | null; finalScore: number | null }>;
  onClose: () => void;
  note?: string;
}

type Stage =
  | { kind: "bucket" }
  | { kind: "comparison"; existing: ComparisonBook }
  | { kind: "score"; score: number };

/**
 * Native parity for the web RankingFlow orchestrator (#116, L-08).
 * Walks bucket → comparison → score using the same handler contract
 * as the web component so callers can share the tRPC wiring.
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
    return <RankingBucketModal bookTitle={newBook.title} onSelect={handleBucket} />;
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
  const popupProps: Parameters<typeof RankingScorePopup>[0] = {
    bookTitle: newBook.title,
    score: stage.score,
    finishedCount: finishedCountAfterSave,
    onClose,
  };
  if (note !== undefined) popupProps.note = note;
  return <RankingScorePopup {...popupProps} />;
}
