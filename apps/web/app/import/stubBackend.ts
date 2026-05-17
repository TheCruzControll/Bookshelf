import type {
  ImportBackend,
  ParseAndMatchResult,
  CommitInput,
  CommitResult,
  ImportReviewRow,
} from "./types";
import type { EntityId } from "@hone/domain";

/**
 * Canned data the page (RSC) hands to the import flow until a tRPC client
 * lands. Mirrors the same "no-op backend" deferral pattern that #76 and
 * #142 use for search/discover.
 *
 * The five rows exercise every UI bucket, including the K-06 duplicate
 * sub-case folded into `conflict` (`isDuplicate: true`).
 */
export const STUB_REVIEW_ROWS: ReadonlyArray<ImportReviewRow> = [
  {
    rowId: "gr-1",
    bucket: "matched",
    title: "Foundation",
    author: "Isaac Asimov",
    goodreadsStatus: "want_to_read",
    bookId: "00000000-0000-0000-0000-0000000000b1" as EntityId,
  },
  {
    rowId: "gr-2",
    bucket: "matched",
    title: "The Left Hand of Darkness",
    author: "Ursula K. Le Guin",
    goodreadsStatus: "finished",
    bookId: "00000000-0000-0000-0000-0000000000b2" as EntityId,
  },
  {
    rowId: "gr-3",
    bucket: "needs_review",
    title: "Hyperion",
    author: "Dan Simmons",
    goodreadsStatus: "want_to_read",
    bookId: "00000000-0000-0000-0000-0000000000b3" as EntityId,
    candidateTitle: "Hyperion (Hyperion Cantos #1)",
    candidateAuthor: "Dan Simmons",
  },
  {
    rowId: "gr-4",
    bucket: "conflict",
    title: "Dune",
    author: "Frank Herbert",
    goodreadsStatus: "finished",
    bookId: "00000000-0000-0000-0000-0000000000b4" as EntityId,
    currentHoneStatus: "reading",
  },
  {
    rowId: "gr-5",
    bucket: "unmatched",
    title: "The Galactic Compendium of Obscure Recipes",
    author: "Unknown Author",
    goodreadsStatus: "want_to_read",
  },
];

export const STUB_PARSE_RESULT: ParseAndMatchResult = {
  importId: "imp_stub_0001",
  totalRows: STUB_REVIEW_ROWS.length,
  rows: STUB_REVIEW_ROWS,
};

/**
 * Stub backend that returns {@link STUB_PARSE_RESULT} for any CSV and
 * acks `commit` with a count derived from the decision map. Used until
 * the tRPC procedures `import.parseAndMatch` and `import.commit` land.
 */
export const STUB_IMPORT_BACKEND: ImportBackend = {
  async parseAndMatch(_csv: string): Promise<ParseAndMatchResult> {
    return STUB_PARSE_RESULT;
  },
  async commit(input: CommitInput): Promise<CommitResult> {
    let applied = 0;
    let skipped = 0;
    for (const decision of Object.values(input.decisions)) {
      if (decision.apply) applied += 1;
      else skipped += 1;
    }
    return { appliedCount: applied, skippedCount: skipped };
  },
};
