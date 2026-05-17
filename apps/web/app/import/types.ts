import type { EntityId, ReadingStatus } from "@hone/domain";

/**
 * Bucket shown to the viewer in the review step.
 *
 * The K-07 acceptance criteria call for a "Review screen with four buckets".
 * After #105 the matcher actually has five (`matched | needs_review |
 * unmatched | conflict | duplicate`); per the implementer brief we collapse
 * `duplicate` into `conflict` because both classes are "rows excluded from
 * auto-apply" from the user's perspective (cf. the docstring in
 * `packages/domain/src/import-match.ts`).
 */
export type ReviewBucket =
  | "matched"
  | "needs_review"
  | "unmatched"
  | "conflict";

/** Shape of a single Goodreads-row preview rendered in the review screen. */
export interface ImportReviewRow {
  /** Stable per-row id (a Goodreads bookId; surrogate for parsed rows). */
  rowId: string;
  /** Bucket assigned by the matcher (collapses K-06 duplicates into conflict). */
  bucket: ReviewBucket;
  /** Goodreads-reported title for the row. */
  title: string;
  /** Goodreads-reported author for the row. */
  author: string;
  /** Goodreads-reported status (drives shelf/status mapping in commit). */
  goodreadsStatus: ReadingStatus;
  /**
   * Catalog/internal book id when the matcher could identify the row.
   * Present for `matched`, `needs_review`, and `conflict` buckets; absent
   * for `unmatched`.
   */
  bookId?: EntityId;
  /**
   * Fuzzy-match candidate the user should confirm. Populated for
   * `needs_review` rows so the UI can show "did you mean X?".
   */
  candidateTitle?: string;
  candidateAuthor?: string;
  /**
   * Current Hone status for `conflict` rows. The UI defaults to "keep
   * Hone" so the user must opt in to overwrite.
   */
  currentHoneStatus?: ReadingStatus;
  /**
   * Set when the K-06 matcher classified the row as `duplicate` (same
   * status both sides). UI displays it inside the `conflict` section but
   * labels it differently — the commit step always skips duplicates so
   * the user has nothing to decide.
   */
  isDuplicate?: boolean;
}

/** Output of `import.parseAndMatch` (stubbed today; tRPC-bound later). */
export interface ParseAndMatchResult {
  /** Server-side import job id; echoed back into `commit`. */
  importId: string;
  /** Raw parsed row count before matching, for the progress UI summary. */
  totalRows: number;
  /** All rows the user reviews, already bucketed. */
  rows: ReadonlyArray<ImportReviewRow>;
}

/**
 * Per-row decisions the viewer makes on the review screen, passed to
 * `import.commit`. Keyed by `rowId`.
 *
 *  - `apply`: include this row in the commit (`matched` defaults true,
 *    `needs_review` defaults false, `conflict` defaults false because
 *    "keep Hone" is the default action).
 *  - `overwriteConflict`: when the row is in the `conflict` bucket and the
 *    user explicitly chose to overwrite Hone's status with Goodreads.
 *    Always `false` for non-conflict rows.
 */
export interface RowDecision {
  apply: boolean;
  overwriteConflict: boolean;
}

export type RowDecisionMap = Readonly<Record<string, RowDecision>>;

/** Input shape for `import.commit`. */
export interface CommitInput {
  importId: string;
  decisions: RowDecisionMap;
}

/** Output shape for `import.commit`. */
export interface CommitResult {
  appliedCount: number;
  skippedCount: number;
}

/**
 * Pluggable backend so the page (RSC) can pass a server-action shim today
 * and switch to a tRPC client when one lands. Mirrors the pattern from the
 * /search page's `SearchBackend` (G-02, #76 / #142).
 */
export interface ImportBackend {
  /**
   * Parse a Goodreads CSV server-side, run the matcher, and bucket each
   * row. Returns a job id the caller threads back into {@link commit}.
   */
  parseAndMatch(csv: string): Promise<ParseAndMatchResult>;
  /** Persist the viewer's per-row decisions. */
  commit(input: CommitInput): Promise<CommitResult>;
}
