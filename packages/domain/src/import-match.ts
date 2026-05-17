import type { GoodreadsRow, EntityId, ReadingStatus } from "./types";
import { normalizeIsbn } from "./isbn";
import {
  levenshtein,
  normalizeForMatch,
  extractSurname,
} from "./levenshtein";

/**
 * Bucket assigned by the matcher.
 *  - `matched`       — definitive identification (ISBN-13 or fuzzy hit) AND the
 *                      viewer's current Hone shelf state agrees with the
 *                      Goodreads row's status (or the viewer has no existing
 *                      entry for the book).
 *  - `needs_review`  — fuzzy title+author hit within tolerance; user must confirm.
 *  - `unmatched`     — no candidate within tolerance.
 *  - `conflict`      — definitive identification, but the viewer already has
 *                      the book on a Hone shelf with a DIFFERENT
 *                      `ReadingStatus` than the Goodreads row reports. The
 *                      caller decides how to resolve (default: keep Hone state).
 */
export type MatchBucket =
  | "matched"
  | "needs_review"
  | "unmatched"
  | "conflict";

/**
 * A minimal book candidate exposed by the lookup port. Only the fields the
 * matcher needs to compute a Levenshtein bound are required.
 */
export interface MatchCandidate {
  bookId: EntityId;
  title: string;
  author: string;
}

/**
 * Lookup port used by `matchImportRow`. Adapters (database, in-memory test
 * doubles) implement this; the matcher itself is pure.
 */
export interface BookLookup {
  /** Find a book by canonical ISBN-13. Returns `null` when no edition matches. */
  findByIsbn13(isbn13: string): Promise<MatchCandidate | null>;
  /**
   * Find candidates by a fuzzy title/author query. The matcher only consumes
   * the returned set — it does not assume any particular ordering or limit.
   * Implementations should return a small superset (e.g. top-10 by some
   * heuristic) so the matcher can do the exact bounded check itself.
   */
  findByTitleAuthor(title: string, author: string): Promise<MatchCandidate[]>;
}

/**
 * Viewer-state lookup port used by `matchImportRow` to detect conflicts
 * between a Goodreads row's reported status and the viewer's existing Hone
 * shelf state for the same `bookId`. Adapters (database, in-memory test
 * doubles) implement this; the matcher itself is pure.
 *
 * Returns the viewer's current `ReadingStatus` for `bookId`, or `null` when
 * the viewer has no shelf entry for that book.
 *
 * If the matcher is invoked without a viewer-state lookup, no conflict
 * detection happens and rows are bucketed as `matched`/`needs_review`/
 * `unmatched` exactly as before — this keeps the matcher backwards
 * compatible for call sites that don't yet have an authenticated viewer.
 */
export interface ViewerShelfStateLookup {
  /**
   * Return the viewer's current `ReadingStatus` for the given `bookId`, or
   * `null` if the viewer has no existing shelf entry for the book. When the
   * viewer has the book on multiple shelves with different statuses (which
   * the schema permits), adapters should return the status from the most
   * recently updated entry.
   */
  getCurrentStatusForBook(bookId: EntityId): Promise<ReadingStatus | null>;
}

/** Result of matching a single Goodreads row. */
export type MatchResult =
  | {
      bucket: "matched";
      confidence: 1;
      bookId: EntityId;
    }
  | {
      bucket: "needs_review";
      confidence: number;
      bookId: EntityId;
      candidate: MatchCandidate;
      titleDistance: number;
      authorSurnameDistance: number;
    }
  | {
      bucket: "unmatched";
      confidence: 0;
    }
  | {
      /**
       * The Goodreads row identifies a book that the viewer already has on a
       * Hone shelf, but with a different `ReadingStatus`. The caller decides
       * how to resolve: per `docs/testing-strategy.md` the user's default
       * action is to keep the Hone state (the import committer applies that
       * default in #106; #103 only buckets and counts conflicts).
       */
      bucket: "conflict";
      confidence: 1;
      bookId: EntityId;
      currentHoneStatus: ReadingStatus;
      goodreadsStatus: ReadingStatus;
    };

/** PRD-mandated Levenshtein bounds. See `docs/prd-backlog.md` (K-02 entry). */
export const MAX_TITLE_DISTANCE = 2;
export const MAX_AUTHOR_SURNAME_DISTANCE = 1;

function isPotentialIsbn13(value: string): boolean {
  return /^\d{13}$/.test(value.replace(/[\s-]/g, ""));
}

/**
 * Compute a confidence score in [0, 1] for a fuzzy match.
 *
 * Formula:
 *   confidence = 0.6 * (1 - titleDist / (MAX_TITLE + 1))
 *              + 0.4 * (1 - authorDist / (MAX_AUTHOR + 1))
 *
 * The "+1" denominator keeps a bound-touching match strictly below the ISBN
 * confidence of 1.0 while still rewarding closer matches. Title is weighted
 * higher than author surname because the title carries more identifying signal
 * (a surname can collide across distinct authors).
 */
function fuzzyConfidence(
  titleDistance: number,
  authorSurnameDistance: number,
): number {
  const titleComponent =
    1 - titleDistance / (MAX_TITLE_DISTANCE + 1);
  const authorComponent =
    1 - authorSurnameDistance / (MAX_AUTHOR_SURNAME_DISTANCE + 1);
  return 0.6 * titleComponent + 0.4 * authorComponent;
}

/**
 * Bucket a definitive (ISBN-confidence) identification against the viewer's
 * existing Hone shelf state. If the viewer already has the book on a shelf
 * with a different `ReadingStatus` than the Goodreads row, return a
 * `conflict` result; otherwise return a plain `matched` result.
 *
 * If no `viewerState` port is wired, conflict detection is skipped and the
 * caller always sees a plain `matched` — this keeps the matcher backwards
 * compatible with call sites that pre-date #103.
 */
async function classifyDefinitiveMatch(
  bookId: EntityId,
  goodreadsStatus: ReadingStatus,
  viewerState: ViewerShelfStateLookup | undefined,
): Promise<MatchResult> {
  if (!viewerState) {
    return { bucket: "matched", confidence: 1, bookId };
  }
  const currentHoneStatus = await viewerState.getCurrentStatusForBook(bookId);
  if (currentHoneStatus !== null && currentHoneStatus !== goodreadsStatus) {
    return {
      bucket: "conflict",
      confidence: 1,
      bookId,
      currentHoneStatus,
      goodreadsStatus,
    };
  }
  return { bucket: "matched", confidence: 1, bookId };
}

/**
 * Match a parsed Goodreads row against the local catalog.
 *
 * Algorithm (per `docs/prd-backlog.md` K-02 + K-04):
 *   1. If the row has a valid ISBN-13 and the lookup returns a hit, classify
 *      as `matched` with confidence 1. If a `viewerState` port is supplied
 *      and the viewer already has the matched book on a Hone shelf with a
 *      DIFFERENT `ReadingStatus` than the row's status, downgrade to
 *      `conflict` instead (still confidence 1 — the identity is certain).
 *   2. Otherwise, query `findByTitleAuthor` and compute the bounded Levenshtein
 *      distance on the normalized title (≤ 2) and the normalized author
 *      surname (≤ 1). The best in-bound candidate (lowest composite distance)
 *      becomes a `needs_review` result. (Conflict detection only applies to
 *      definitive ISBN identifications — fuzzy matches stay in
 *      `needs_review` because the user has to confirm identity first.)
 *   3. If no candidate is in bound, classify as `unmatched`.
 *
 * This function is pure: it performs no I/O of its own and consults the
 * lookup ports only.
 */
export async function matchImportRow(
  row: GoodreadsRow,
  lookup: BookLookup,
  viewerState?: ViewerShelfStateLookup,
): Promise<MatchResult> {
  // 1. ISBN-13 path. Goodreads sometimes prefixes ISBNs with `=` (handled by
  //    the parser) but malformed values still slip through, so we validate
  //    via `normalizeIsbn` and only accept genuine ISBN-13 codes here.
  const isbnCandidates: string[] = [];
  if (row.isbn13 && isPotentialIsbn13(row.isbn13)) {
    isbnCandidates.push(row.isbn13);
  }
  if (row.isbn10) {
    isbnCandidates.push(row.isbn10);
  }

  for (const raw of isbnCandidates) {
    let canonical: string;
    try {
      canonical = normalizeIsbn(raw);
    } catch {
      continue;
    }
    const hit = await lookup.findByIsbn13(canonical);
    if (hit) {
      return await classifyDefinitiveMatch(hit.bookId, row.status, viewerState);
    }
  }

  // 2. Fuzzy title/author path.
  const rowTitle = normalizeForMatch(row.title);
  const rowSurname = extractSurname(row.author);

  if (!rowTitle || !rowSurname) {
    return { bucket: "unmatched", confidence: 0 };
  }

  const candidates = await lookup.findByTitleAuthor(row.title, row.author);

  let best: {
    candidate: MatchCandidate;
    titleDistance: number;
    authorSurnameDistance: number;
    composite: number;
  } | null = null;

  for (const candidate of candidates) {
    const candTitle = normalizeForMatch(candidate.title);
    const candSurname = extractSurname(candidate.author);
    if (!candTitle || !candSurname) continue;

    const titleDistance = levenshtein(
      rowTitle,
      candTitle,
      MAX_TITLE_DISTANCE,
    );
    if (titleDistance > MAX_TITLE_DISTANCE) continue;

    const authorSurnameDistance = levenshtein(
      rowSurname,
      candSurname,
      MAX_AUTHOR_SURNAME_DISTANCE,
    );
    if (authorSurnameDistance > MAX_AUTHOR_SURNAME_DISTANCE) continue;

    // Composite weighted distance; title weighs more heavily, matching the
    // confidence formula above.
    const composite = titleDistance * 0.6 + authorSurnameDistance * 0.4;
    if (!best || composite < best.composite) {
      best = {
        candidate,
        titleDistance,
        authorSurnameDistance,
        composite,
      };
    }
  }

  if (best) {
    return {
      bucket: "needs_review",
      confidence: fuzzyConfidence(
        best.titleDistance,
        best.authorSurnameDistance,
      ),
      bookId: best.candidate.bookId,
      candidate: best.candidate,
      titleDistance: best.titleDistance,
      authorSurnameDistance: best.authorSurnameDistance,
    };
  }

  // 3. No candidate met both bounds.
  return { bucket: "unmatched", confidence: 0 };
}
