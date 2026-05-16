/**
 * Edition merge logic (F-06 / issue #72).
 *
 * Two rules govern how catalog search results coalesce into the local
 * `books` + `editions` model:
 *
 *  1. **Same ISBN-13 → one Book + multiple Editions.** When a `BookSearchResult`
 *     arrives whose ISBN-13 matches an existing Edition, the new Edition
 *     attaches to the existing Book — we never create a second Book row for
 *     the same canonical ISBN-13. The corollary: when an Open Library result
 *     and a Google Books result share an ISBN-13, both Edition rows hang off
 *     the same Book.
 *
 *  2. **OL work id back-fills GB-sourced books.** A Book first seen via
 *     Google Books has no `olWorkId` (Google Books exposes no equivalent).
 *     When an Open Library result later surfaces for the same canonical
 *     ISBN-13, we populate the Book's `olWorkId` from the OL result's
 *     `workId`. Once set, `olWorkId` is treated as authoritative and is
 *     never overwritten — only nulls are filled.
 *
 * This module is pure: it takes the existing Book (if any) plus the new
 * search result and returns a `CatalogMergePlan` describing what should
 * happen. The repository adapter consumes the plan and performs the actual
 * INSERT/UPDATE SQL within a transaction.
 */

import type { Book, BookSearchResult, Edition, EntityId } from "./types";

/**
 * The action the caller should take for the Book row.
 *
 *  - `create`: insert a new Book using the supplied attributes.
 *  - `update`: an existing Book matched by ISBN-13; the caller should
 *    `UPDATE books SET ... WHERE id = bookId` with the fields in `patch`.
 *    An empty `patch` means no Book-level change is needed.
 */
export type BookAction =
  | {
      kind: "create";
      attributes: {
        canonicalTitle: string;
        subtitle: string | undefined;
        description: string | undefined;
        coverUrl: string | undefined;
        firstPublishedYear: number | undefined;
        olWorkId: string | undefined;
      };
    }
  | {
      kind: "update";
      bookId: EntityId;
      patch: BookPatch;
    };

export interface BookPatch {
  /**
   * Only populated when the existing Book row's `olWorkId` is null AND the
   * new result is an Open Library result carrying a `workId`. Once set,
   * `olWorkId` is never overwritten.
   */
  olWorkId?: string;
}

/**
 * Attributes for the Edition row to upsert.
 *
 * The caller is responsible for de-duplicating editions by `(source, sourceKey)`
 * or by ISBN — the merge planner only describes the desired state.
 */
export interface EditionUpsert {
  isbn10: string | undefined;
  isbn13: string | undefined;
  title: string;
  publisher: string | undefined;
  publishedDate: string | undefined;
  pageCount: number | undefined;
  source: "open_library" | "google_books";
  sourceKey: string | undefined;
}

export interface CatalogMergePlan {
  book: BookAction;
  edition: EditionUpsert;
}

/**
 * Outcome returned by `BookRepository.upsertFromCatalogResult` after the
 * planned actions have been applied. The caller can use this to drive
 * follow-on bookkeeping (e.g. logging, cache invalidation) without
 * re-reading the Book row.
 */
export interface CatalogMergeOutcome {
  book: Book;
  edition: Edition;
  /** `true` when a new Book row was inserted; `false` when an existing Book matched the ISBN-13. */
  bookCreated: boolean;
  /** `true` when a new Edition row was inserted; `false` when `(source, sourceKey)` already existed. */
  editionCreated: boolean;
  /** `true` when the merge populated a previously-null `olWorkId` on the existing Book. */
  workIdBackfilled: boolean;
}

/**
 * Decide how a freshly-fetched `BookSearchResult` should be merged into the
 * local catalog.
 *
 * @param result        the new catalog hit being persisted
 * @param existingBook  the current Book row that matches the result's
 *                      ISBN-13, or `null` if no such row exists. Callers
 *                      look this up via `BookRepository.findBookByIsbn13`
 *                      *before* calling this function.
 *
 * Behaviour:
 *  - `existingBook == null` → emit a `create` action carrying every
 *    Book-level attribute the result provides. `olWorkId` is populated
 *    only when the result is an OL result.
 *  - `existingBook != null` → emit an `update` action with a `patch` that
 *    is empty unless the existing Book has no `olWorkId` and the new
 *    result is an OL result with a `workId`. This is the back-fill path.
 *
 * The Edition portion of the plan is always populated — the caller may
 * choose to skip the insert if `(source, sourceKey)` already exists.
 */
export function planCatalogMerge(
  result: BookSearchResult,
  existingBook: Book | null,
): CatalogMergePlan {
  const edition: EditionUpsert = {
    isbn10: result.isbn10,
    isbn13: result.isbn13,
    title: result.title,
    publisher: result.publisher,
    publishedDate: result.publishedDate,
    pageCount: result.pageCount,
    source: result.source,
    sourceKey: result.sourceKey,
  };

  if (existingBook === null) {
    return {
      book: {
        kind: "create",
        attributes: {
          canonicalTitle: result.title,
          subtitle: result.subtitle,
          description: result.description,
          coverUrl: result.coverUrl,
          firstPublishedYear: result.firstPublishedYear,
          olWorkId:
            result.source === "open_library" ? result.workId : undefined,
        },
      },
      edition,
    };
  }

  const patch: BookPatch = {};
  // Back-fill rule: only when existing is null AND new result is OL with workId.
  if (
    existingBook.olWorkId === undefined &&
    result.source === "open_library" &&
    result.workId !== undefined
  ) {
    patch.olWorkId = result.workId;
  }

  return {
    book: {
      kind: "update",
      bookId: existingBook.id,
      patch,
    },
    edition,
  };
}
