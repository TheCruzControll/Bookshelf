/**
 * K-08 — Goodreads import fixture bucket-assertion tests.
 *
 * For each of the five canonical Goodreads CSV fixtures shipped from
 * `@hone/test-fixtures/src/fixtures/goodreads`, this suite:
 *   1. Loads the CSV via the package-relative loader.
 *   2. Parses it with `parseGoodreadsCsv` (#100).
 *   3. Runs each row through `matchImportRow` (#101 / #103 / #105) with a
 *      stubbed `BookLookup` + `ViewerShelfStateLookup` whose responses encode
 *      the fixture's intended scenario.
 *   4. Asserts the resulting `MatchBucket` for each row matches the
 *      fixture's expected assignment.
 *
 * The re-upload fixture also exercises job-level idempotency: the test hashes
 * the file content twice, primes the `ImportRepository.findByOwnerAndHash`
 * port with a record under that hash, and asserts
 * `ImportService.checkForDuplicate` flags the second upload as a duplicate.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  computeImportIdempotencyHash,
  parseGoodreadsCsv,
} from "./goodreads";
import {
  matchImportRow,
  type BookLookup,
  type MatchCandidate,
  type ViewerShelfStateLookup,
} from "./import-match";
import { ImportService, REUPLOAD_OPTIONS } from "./services";
import type { ImportRepository } from "./ports";
import type {
  EntityId,
  GoodreadsRow,
  Import,
  ReadingStatus,
} from "./types";

const FIXTURE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "test-fixtures",
  "src",
  "fixtures",
  "goodreads",
);

type GoodreadsFixtureName =
  | "matched.csv"
  | "needs-review.csv"
  | "unmatched.csv"
  | "re-upload.csv"
  | "conflict.csv";

function loadGoodreadsFixture(name: GoodreadsFixtureName): string {
  return readFileSync(join(FIXTURE_DIR, name), "utf-8");
}

// Stable UUIDs so test assertions can pin the matched book id.
const BOOK_FOX = "00000000-0000-0000-0000-000000000f01";
const BOOK_HOBBIT = "00000000-0000-0000-0000-000000000f02";
const BOOK_GATSBY = "00000000-0000-0000-0000-000000000f03";
const BOOK_BELOVED = "00000000-0000-0000-0000-000000000f04";
const BOOK_STONER = "00000000-0000-0000-0000-000000000f05";
const BOOK_LITTLE_PRINCE = "00000000-0000-0000-0000-000000000f06";
const BOOK_AMBIGUOUS = "00000000-0000-0000-0000-000000000f07";

const OWNER_ID: EntityId = "00000000-0000-0000-0000-0000000000a1";

/** Canonical title/author for each candidate book, used to seed the
 *  in-memory catalog so the fuzzy-match path returns a deterministic
 *  candidate set. */
interface SeededBook {
  bookId: EntityId;
  title: string;
  author: string;
  isbn13: string;
}

const CATALOG: readonly SeededBook[] = [
  {
    bookId: BOOK_FOX,
    title: "Fantastic Mr. Fox",
    author: "Roald Dahl",
    isbn13: "9780142410387",
  },
  {
    bookId: BOOK_HOBBIT,
    title: "The Hobbit",
    author: "J.R.R. Tolkien",
    isbn13: "9780547928227",
  },
  {
    bookId: BOOK_GATSBY,
    title: "The Great Gatsby",
    author: "F. Scott Fitzgerald",
    isbn13: "9780743273565",
  },
  {
    bookId: BOOK_BELOVED,
    title: "Beloved",
    author: "Toni Morrison",
    isbn13: "9781400033416",
  },
  {
    bookId: BOOK_STONER,
    title: "Stoner",
    author: "John Williams",
    isbn13: "9781590171998",
  },
  {
    bookId: BOOK_LITTLE_PRINCE,
    title: "The Little Prince",
    author: "Antoine de Saint-Exupéry",
    isbn13: "9780156012195",
  },
  // Fuzzy-only candidate for the needs-review fixture; the row in
  // `needs-review.csv` has no ISBN but the title and author are within the
  // PRD Levenshtein bounds of this entry.
  {
    bookId: BOOK_AMBIGUOUS,
    title: "Some Ambiguous Titles",
    author: "Unknow Author",
    isbn13: "9780000000000",
  },
];

function candidateOf(book: SeededBook): MatchCandidate {
  return { bookId: book.bookId, title: book.title, author: book.author };
}

/** Build a `BookLookup` adapter backed by the static `CATALOG` above. */
function makeCatalogLookup(): BookLookup {
  const byIsbn = new Map<string, SeededBook>();
  for (const book of CATALOG) byIsbn.set(book.isbn13, book);

  return {
    findByIsbn13: async (isbn13) => {
      const book = byIsbn.get(isbn13);
      return book ? candidateOf(book) : null;
    },
    // The matcher does the bounded Levenshtein itself; we return all books as
    // the candidate superset so the matcher's own bounds decide what fits.
    findByTitleAuthor: async () => CATALOG.map(candidateOf),
  };
}

/** Build a `ViewerShelfStateLookup` adapter from a static map. */
function makeViewerState(
  states: ReadonlyMap<EntityId, ReadingStatus>,
): ViewerShelfStateLookup {
  return {
    getCurrentStatusForBook: async (bookId) => states.get(bookId) ?? null,
  };
}

const EMPTY_VIEWER_STATE: ViewerShelfStateLookup = makeViewerState(new Map());

function findRow(rows: readonly GoodreadsRow[], title: string): GoodreadsRow {
  const row = rows.find((r) => r.title === title);
  if (!row) {
    throw new Error(`Fixture missing expected row with title "${title}"`);
  }
  return row;
}

describe("Goodreads import fixture buckets (K-08)", () => {
  describe("matched.csv — every row buckets as `matched`", () => {
    it("ISBN hits resolve to the catalog book with confidence 1", async () => {
      const { rows } = parseGoodreadsCsv(loadGoodreadsFixture("matched.csv"));
      const lookup = makeCatalogLookup();

      const results = await Promise.all(
        rows.map((r) => matchImportRow(r, lookup, EMPTY_VIEWER_STATE)),
      );

      expect(results).toHaveLength(2);
      for (const result of results) {
        expect(result.bucket).toBe("matched");
        expect(result.confidence).toBe(1);
      }

      const fox = results[0]!;
      const hobbit = results[1]!;
      if (fox.bucket !== "matched" || hobbit.bucket !== "matched") {
        throw new Error("unreachable: bucket asserted above");
      }
      expect(fox.bookId).toBe(BOOK_FOX);
      expect(hobbit.bookId).toBe(BOOK_HOBBIT);
    });
  });

  describe("needs-review.csv — fuzzy title/author hit without an ISBN", () => {
    it("buckets the single row as `needs_review`", async () => {
      const { rows } = parseGoodreadsCsv(
        loadGoodreadsFixture("needs-review.csv"),
      );
      const lookup = makeCatalogLookup();

      const results = await Promise.all(
        rows.map((r) => matchImportRow(r, lookup, EMPTY_VIEWER_STATE)),
      );

      expect(results).toHaveLength(1);
      const result = results[0]!;
      expect(result.bucket).toBe("needs_review");
      if (result.bucket !== "needs_review") {
        throw new Error("unreachable: bucket asserted above");
      }
      expect(result.bookId).toBe(BOOK_AMBIGUOUS);
      // Confidence is the fuzzy-confidence formula, strictly less than the
      // ISBN confidence of 1.
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThan(1);
    });
  });

  describe("unmatched.csv — no ISBN and no in-bound fuzzy candidate", () => {
    it("buckets the single row as `unmatched`", async () => {
      const { rows } = parseGoodreadsCsv(
        loadGoodreadsFixture("unmatched.csv"),
      );
      const lookup = makeCatalogLookup();

      const results = await Promise.all(
        rows.map((r) => matchImportRow(r, lookup, EMPTY_VIEWER_STATE)),
      );

      expect(results).toHaveLength(1);
      const result = results[0]!;
      expect(result.bucket).toBe("unmatched");
      expect(result.confidence).toBe(0);
    });
  });

  describe("conflict.csv — definitive matches with viewer-state divergence", () => {
    it("buckets rows as `conflict` or `duplicate` per viewer status", async () => {
      const { rows } = parseGoodreadsCsv(loadGoodreadsFixture("conflict.csv"));
      const lookup = makeCatalogLookup();

      // Viewer already shelved each conflict-fixture book; one entry
      // disagrees with the row (Gatsby on `dropped` vs row `finished`), one
      // agrees (Beloved on `finished` matching the row → duplicate), and
      // one disagrees on a different axis (Stoner on `finished` vs row
      // `reading`).
      const viewerState = makeViewerState(
        new Map<EntityId, ReadingStatus>([
          [BOOK_GATSBY, "dropped"],
          [BOOK_BELOVED, "finished"],
          [BOOK_STONER, "finished"],
        ]),
      );

      const results = await Promise.all(
        rows.map((r) => matchImportRow(r, lookup, viewerState)),
      );

      expect(results).toHaveLength(3);

      const byTitle = new Map(rows.map((r, i) => [r.title, results[i]!]));

      const gatsby = byTitle.get("The Great Gatsby");
      const beloved = byTitle.get("Beloved");
      const stoner = byTitle.get("Stoner");
      if (!gatsby || !beloved || !stoner) {
        throw new Error("conflict.csv missing one of the seeded rows");
      }

      expect(gatsby.bucket).toBe("conflict");
      if (gatsby.bucket === "conflict") {
        expect(gatsby.bookId).toBe(BOOK_GATSBY);
        expect(gatsby.currentHoneStatus).toBe("dropped");
        expect(gatsby.goodreadsStatus).toBe("finished");
      }

      expect(beloved.bucket).toBe("duplicate");
      if (beloved.bucket === "duplicate") {
        expect(beloved.bookId).toBe(BOOK_BELOVED);
        expect(beloved.currentHoneStatus).toBe("finished");
        expect(beloved.goodreadsStatus).toBe("finished");
      }

      expect(stoner.bucket).toBe("conflict");
      if (stoner.bucket === "conflict") {
        expect(stoner.bookId).toBe(BOOK_STONER);
        expect(stoner.currentHoneStatus).toBe("finished");
        expect(stoner.goodreadsStatus).toBe("reading");
      }
    });

    it("without viewer state, the same rows all bucket as plain `matched`", async () => {
      const { rows } = parseGoodreadsCsv(loadGoodreadsFixture("conflict.csv"));
      const lookup = makeCatalogLookup();

      const results = await Promise.all(rows.map((r) => matchImportRow(r, lookup)));

      expect(results).toHaveLength(3);
      for (const result of results) {
        expect(result.bucket).toBe("matched");
      }
    });
  });

  describe("re-upload.csv — row-level buckets stable AND job-level hash collision", () => {
    it("row buckets are stable when the same CSV is re-parsed", async () => {
      const csv = loadGoodreadsFixture("re-upload.csv");
      const lookup = makeCatalogLookup();

      const firstParse = parseGoodreadsCsv(csv);
      const secondParse = parseGoodreadsCsv(csv);

      const first = await Promise.all(
        firstParse.rows.map((r) =>
          matchImportRow(r, lookup, EMPTY_VIEWER_STATE),
        ),
      );
      const second = await Promise.all(
        secondParse.rows.map((r) =>
          matchImportRow(r, lookup, EMPTY_VIEWER_STATE),
        ),
      );

      expect(first.map((r) => r.bucket)).toEqual(second.map((r) => r.bucket));
      expect(first).toHaveLength(2);
      expect(first.every((r) => r.bucket === "matched")).toBe(true);

      const fox = findRow(firstParse.rows, "Fantastic Mr. Fox");
      const prince = findRow(firstParse.rows, "The Little Prince");
      const foxResult = first[firstParse.rows.indexOf(fox)]!;
      const princeResult = first[firstParse.rows.indexOf(prince)]!;
      if (foxResult.bucket === "matched") {
        expect(foxResult.bookId).toBe(BOOK_FOX);
      }
      if (princeResult.bucket === "matched") {
        expect(princeResult.bookId).toBe(BOOK_LITTLE_PRINCE);
      }
    });

    it("ImportService.checkForDuplicate flags an identical-content re-upload", async () => {
      const csv = loadGoodreadsFixture("re-upload.csv");
      const hashFirst = computeImportIdempotencyHash(csv);
      const hashSecond = computeImportIdempotencyHash(csv);
      expect(hashFirst).toBe(hashSecond);

      const existingImport: Import = {
        id: "00000000-0000-0000-0000-0000000000b1",
        ownerId: OWNER_ID,
        source: "goodreads",
        idempotencyHash: hashFirst,
        conflictCount: 0,
        status: "completed",
        createdAt: new Date("2026-05-17T00:00:00.000Z"),
      };

      const findByOwnerAndHash = vi.fn(async (input: {
        ownerId: EntityId;
        hash: string;
      }) => {
        if (
          input.ownerId === OWNER_ID &&
          input.hash === hashFirst
        ) {
          return existingImport;
        }
        return null;
      });

      const repo: ImportRepository = {
        create: vi.fn().mockResolvedValue(existingImport),
        findById: vi.fn().mockResolvedValue(null),
        findByOwnerAndHash,
        listByOwner: vi.fn().mockResolvedValue([existingImport]),
        updateStatus: vi.fn().mockResolvedValue(existingImport),
      };

      const service = new ImportService(repo);

      const result = await service.checkForDuplicate({
        ownerId: OWNER_ID,
        fileHash: hashSecond,
      });

      expect(result.isDuplicate).toBe(true);
      expect(result.existingImportId).toBe(existingImport.id);
      expect(result.options).toEqual(REUPLOAD_OPTIONS);
      expect(findByOwnerAndHash).toHaveBeenCalledWith({
        ownerId: OWNER_ID,
        hash: hashFirst,
      });
    });

    it("a different fixture's hash does NOT collide with the re-upload hash", () => {
      const reupload = computeImportIdempotencyHash(
        loadGoodreadsFixture("re-upload.csv"),
      );
      const matched = computeImportIdempotencyHash(
        loadGoodreadsFixture("matched.csv"),
      );
      expect(reupload).not.toBe(matched);
    });
  });
});
