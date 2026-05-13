"use client";

import { useCallback, useState } from "react";

export interface ComparisonBook {
  id: string;
  title: string;
  author: string;
  coverUrl?: string;
  /** Optional short review excerpt to surface alongside the card. */
  excerpt?: string;
  /** The existing book's score. Only rendered when scores are unlocked. */
  score?: number;
}

export interface RankingComparisonModalProps {
  /** The new book being ranked. Its score is never shown. */
  newBook: ComparisonBook;
  /** The existing ranked book the user is comparing against. */
  existingBook: ComparisonBook;
  /** Whether the viewer has unlocked 0-10 scores (>= 10 finished books). */
  scoresUnlocked: boolean;
  /**
   * Called with `"new"` when the user picks the new book as more their
   * taste, `"existing"` otherwise. The caller drives the next iteration
   * of the binary search by updating `existingBook` on the next render.
   */
  onPick: (choice: "new" | "existing") => Promise<void> | void;
}

/**
 * Comparison step of the ranking flow per docs/ranking-flow-spec.md.
 *
 * The prompt asks "Which is more your taste?" and renders two book
 * cards side-by-side. The existing book's score is shown only when
 * the viewer's scores are unlocked; the new book never displays a
 * provisional score during comparisons.
 */
export function RankingComparisonModal({
  newBook,
  existingBook,
  scoresUnlocked,
  onPick,
}: RankingComparisonModalProps) {
  const [pending, setPending] = useState(false);

  const pick = useCallback(
    async (choice: "new" | "existing") => {
      if (pending) return;
      setPending(true);
      try {
        await onPick(choice);
      } finally {
        setPending(false);
      }
    },
    [pending, onPick],
  );

  return (
    <div
      className="rankingModal"
      role="dialog"
      aria-modal="true"
      aria-label="Compare books"
    >
      <h2 className="rankingModalTitle">Which is more your taste?</h2>
      <div className="comparisonPair">
        <button
          type="button"
          className="comparisonCard"
          onClick={() => pick("new")}
          disabled={pending}
          aria-label={`Pick ${newBook.title}`}
        >
          {newBook.coverUrl ? (
            <img src={newBook.coverUrl} alt="" className="comparisonCover" width={96} height={144} />
          ) : null}
          <p className="comparisonTitle">{newBook.title}</p>
          <p className="comparisonAuthor">{newBook.author}</p>
          {newBook.excerpt ? <p className="comparisonExcerpt">{newBook.excerpt}</p> : null}
        </button>

        <button
          type="button"
          className="comparisonCard"
          onClick={() => pick("existing")}
          disabled={pending}
          aria-label={`Pick ${existingBook.title}`}
        >
          {existingBook.coverUrl ? (
            <img
              src={existingBook.coverUrl}
              alt=""
              className="comparisonCover"
              width={96}
              height={144}
            />
          ) : null}
          <p className="comparisonTitle">{existingBook.title}</p>
          <p className="comparisonAuthor">{existingBook.author}</p>
          {existingBook.excerpt ? (
            <p className="comparisonExcerpt">{existingBook.excerpt}</p>
          ) : null}
          {scoresUnlocked && typeof existingBook.score === "number" ? (
            <p className="comparisonScore" aria-label="Score">
              {existingBook.score.toFixed(2)}
            </p>
          ) : null}
        </button>
      </div>
    </div>
  );
}
