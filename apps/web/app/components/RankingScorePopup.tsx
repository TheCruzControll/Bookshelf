"use client";

import { SCORE_UNLOCK_THRESHOLD } from "@hone/domain";

export interface RankingScorePopupProps {
  /** Title of the book that was just ranked. */
  bookTitle: string;
  /** The derived 0-10 score for the new placement. */
  score: number;
  /**
   * Total number of finished/ranked books the user has *after* this
   * placement is saved. Used to drive the unlock state and calibration
   * progress label.
   */
  finishedCount: number;
  /** Optional review/note text the user attached during the flow. */
  note?: string;
  /** Handler for the popup's close action. */
  onClose: () => void;
}

/**
 * Final placement popup per docs/ranking-flow-spec.md.
 *
 * - Before unlock (finishedCount < 10): show "?" and calibration progress.
 * - At exactly 10: special "Taste Scores Unlocked" popup, surface the score.
 * - After unlock: show the numeric score formatted to 2 decimals.
 * - Never show buckets, previous score, or nearby-placement context.
 */
export function RankingScorePopup({
  bookTitle,
  score,
  finishedCount,
  note,
  onClose,
}: RankingScorePopupProps) {
  const unlocked = finishedCount >= SCORE_UNLOCK_THRESHOLD;
  const justUnlocked = unlocked && finishedCount === SCORE_UNLOCK_THRESHOLD;

  return (
    <div
      className="rankingModal"
      role="dialog"
      aria-modal="true"
      aria-label={
        justUnlocked
          ? "Taste scores unlocked"
          : unlocked
            ? "Score result"
            : "Calibration progress"
      }
    >
      {justUnlocked ? (
        <h2 className="rankingModalTitle">Taste Scores Unlocked</h2>
      ) : (
        <h2 className="rankingModalTitle">{bookTitle}</h2>
      )}

      <p className="rankingScore" aria-label="Score">
        {unlocked ? score.toFixed(2) : "?"}
      </p>

      {!unlocked ? (
        <p
          className="rankingCalibration"
          aria-label="Calibration progress"
        >
          {finishedCount}/{SCORE_UNLOCK_THRESHOLD} ranked
        </p>
      ) : null}

      {note ? <p className="rankingNote">{note}</p> : null}

      <button
        type="button"
        className="rankingModalSubmit"
        onClick={onClose}
        aria-label="Close"
      >
        Done
      </button>
    </div>
  );
}
