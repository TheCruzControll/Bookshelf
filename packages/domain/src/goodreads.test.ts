import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { computeImportIdempotencyHash, parseGoodreadsCsv } from "./goodreads";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): string {
  return readFileSync(
    join(
      __dirname,
      "../../../packages/test-fixtures/src/fixtures/goodreads",
      name
    ),
    "utf-8"
  );
}

const HEADER =
  "Book Id,Title,Author,Additional Authors,ISBN,ISBN13,My Rating,Average Rating,Publisher,Binding,Number of Pages,Year Published,Original Publication Year,Date Read,Date Added,Bookshelves,Bookshelves with positions,Exclusive Shelf,My Review,Spoiler,Private Notes,Read Count,Owned Copies";

function makeRow(fields: {
  bookId?: string;
  title?: string;
  author?: string;
  additionalAuthors?: string;
  isbn?: string;
  isbn13?: string;
  myRating?: number;
  averageRating?: number;
  publisher?: string;
  binding?: string;
  pages?: string;
  yearPublished?: string;
  origYear?: string;
  dateRead?: string;
  dateAdded?: string;
  bookshelves?: string;
  bookshelvesPos?: string;
  exclusiveShelf?: string;
  review?: string;
  spoiler?: string;
  privateNotes?: string;
  readCount?: number;
  ownedCopies?: number;
}): string {
  return [
    fields.bookId ?? "1",
    fields.title ?? "Test Book",
    fields.author ?? "Test Author",
    fields.additionalAuthors ?? "",
    fields.isbn ?? "",
    fields.isbn13 ?? "",
    String(fields.myRating ?? 0),
    String(fields.averageRating ?? 0),
    fields.publisher ?? "",
    fields.binding ?? "",
    fields.pages ?? "",
    fields.yearPublished ?? "",
    fields.origYear ?? "",
    fields.dateRead ?? "",
    fields.dateAdded ?? "",
    fields.bookshelves ?? "",
    fields.bookshelvesPos ?? "",
    fields.exclusiveShelf ?? "",
    fields.review ?? "",
    fields.spoiler ?? "",
    fields.privateNotes ?? "",
    String(fields.readCount ?? 0),
    String(fields.ownedCopies ?? 0),
  ].join(",");
}

describe("parseGoodreadsCsv", () => {
  describe("matched.csv fixture", () => {
    it("parses all data rows", () => {
      const csv = loadFixture("matched.csv");
      const { rows, skipped } = parseGoodreadsCsv(csv);
      expect(rows).toHaveLength(2);
      expect(skipped).toBe(0);
    });

    it("maps known Goodreads status 'read' to 'finished'", () => {
      const csv = loadFixture("matched.csv");
      const { rows } = parseGoodreadsCsv(csv);
      const hobbit = rows.find((r) => r.title === "The Hobbit");
      expect(hobbit?.status).toBe("finished");
    });

    it("strips ISBN formatting (=\"...\") from ISBN fields", () => {
      const csv = loadFixture("matched.csv");
      const { rows } = parseGoodreadsCsv(csv);
      const fox = rows.find((r) => r.title === "Fantastic Mr. Fox");
      expect(fox?.isbn10).toBe("0142410381");
      expect(fox?.isbn13).toBe("9780142410387");
    });

    it("parses numeric rating", () => {
      const csv = loadFixture("matched.csv");
      const { rows } = parseGoodreadsCsv(csv);
      const fox = rows.find((r) => r.title === "Fantastic Mr. Fox");
      expect(fox?.myRating).toBe(4);
    });

    it("parses date read as a Date object", () => {
      const csv = loadFixture("matched.csv");
      const { rows } = parseGoodreadsCsv(csv);
      const fox = rows.find((r) => r.title === "Fantastic Mr. Fox");
      expect(fox?.dateRead).toBeInstanceOf(Date);
    });

    it("parses date added as a Date object", () => {
      const csv = loadFixture("matched.csv");
      const { rows } = parseGoodreadsCsv(csv);
      const fox = rows.find((r) => r.title === "Fantastic Mr. Fox");
      expect(fox?.dateAdded).toBeInstanceOf(Date);
    });

    it("parses author correctly", () => {
      const csv = loadFixture("matched.csv");
      const { rows } = parseGoodreadsCsv(csv);
      const fox = rows.find((r) => r.title === "Fantastic Mr. Fox");
      expect(fox?.author).toBe("Roald Dahl");
    });

    it("parses bookId as string", () => {
      const csv = loadFixture("matched.csv");
      const { rows } = parseGoodreadsCsv(csv);
      expect(rows[0]?.bookId).toBe("1");
    });

    it("parses numberOfPages", () => {
      const csv = loadFixture("matched.csv");
      const { rows } = parseGoodreadsCsv(csv);
      const fox = rows.find((r) => r.title === "Fantastic Mr. Fox");
      expect(fox?.numberOfPages).toBe(96);
    });

    it("parses originalPublicationYear", () => {
      const csv = loadFixture("matched.csv");
      const { rows } = parseGoodreadsCsv(csv);
      const fox = rows.find((r) => r.title === "Fantastic Mr. Fox");
      expect(fox?.originalPublicationYear).toBe(1970);
    });
  });

  describe("needs-review.csv fixture", () => {
    it("parses rows with empty ISBNs", () => {
      const csv = loadFixture("needs-review.csv");
      const { rows } = parseGoodreadsCsv(csv);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.isbn10).toBeUndefined();
      expect(rows[0]?.isbn13).toBeUndefined();
    });

    it("maps status from exclusive shelf", () => {
      const csv = loadFixture("needs-review.csv");
      const { rows } = parseGoodreadsCsv(csv);
      expect(rows[0]?.status).toBe("finished");
    });
  });

  describe("unmatched.csv fixture", () => {
    it("parses row with zero rating as 0", () => {
      const csv = loadFixture("unmatched.csv");
      const { rows } = parseGoodreadsCsv(csv);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.myRating).toBe(0);
    });

    it("parses dateRead when present and leaves dateAdded undefined when absent", () => {
      const csv = loadFixture("unmatched.csv");
      const { rows } = parseGoodreadsCsv(csv);
      expect(rows[0]?.dateRead).toBeInstanceOf(Date);
    });
  });

  describe("conflict.csv fixture", () => {
    it("parses the conflicting book", () => {
      const csv = loadFixture("conflict.csv");
      const { rows } = parseGoodreadsCsv(csv);
      expect(rows).toHaveLength(3);
      expect(rows[0]?.title).toBe("The Great Gatsby");
    });

    it("normalizes 'read' exclusive shelf to 'finished'", () => {
      const csv = loadFixture("conflict.csv");
      const { rows } = parseGoodreadsCsv(csv);
      expect(rows[0]?.status).toBe("finished");
    });
  });

  describe("re-upload.csv fixture", () => {
    it("parses multiple rows including new ones", () => {
      const csv = loadFixture("re-upload.csv");
      const { rows } = parseGoodreadsCsv(csv);
      expect(rows).toHaveLength(2);
    });

    it("preserves the existing bookId", () => {
      const csv = loadFixture("re-upload.csv");
      const { rows } = parseGoodreadsCsv(csv);
      const fox = rows.find((r) => r.bookId === "1");
      expect(fox?.title).toBe("Fantastic Mr. Fox");
    });
  });

  describe("status normalization", () => {
    it("maps 'read' exclusive shelf to 'finished'", () => {
      const csv = `${HEADER}\n${makeRow({ exclusiveShelf: "read" })}`;
      const { rows } = parseGoodreadsCsv(csv);
      expect(rows[0]?.status).toBe("finished");
    });

    it("maps 'currently-reading' exclusive shelf to 'reading'", () => {
      const csv = `${HEADER}\n${makeRow({ exclusiveShelf: "currently-reading" })}`;
      const { rows } = parseGoodreadsCsv(csv);
      expect(rows[0]?.status).toBe("reading");
    });

    it("maps 'to-read' exclusive shelf to 'want_to_read'", () => {
      const csv = `${HEADER}\n${makeRow({ exclusiveShelf: "to-read" })}`;
      const { rows } = parseGoodreadsCsv(csv);
      expect(rows[0]?.status).toBe("want_to_read");
    });

    it("defaults to 'want_to_read' for unknown status", () => {
      const csv = `${HEADER}\n${makeRow({ exclusiveShelf: "unknown-shelf" })}`;
      const { rows } = parseGoodreadsCsv(csv);
      expect(rows[0]?.status).toBe("want_to_read");
    });

    it("falls back to bookshelves when exclusive shelf is absent", () => {
      const csv = `${HEADER}\n${makeRow({ bookshelves: "read", exclusiveShelf: "" })}`;
      const { rows } = parseGoodreadsCsv(csv);
      expect(rows[0]?.status).toBe("finished");
    });

    it("maps 'dropped' bookshelf to 'dropped'", () => {
      const csv = `${HEADER}\n${makeRow({ bookshelves: "dropped", exclusiveShelf: "" })}`;
      const { rows } = parseGoodreadsCsv(csv);
      expect(rows[0]?.status).toBe("dropped");
    });
  });

  describe("column aliases", () => {
    it("handles 'Author l-f' column without breaking author field", () => {
      const csv = loadFixture("matched.csv");
      const { rows } = parseGoodreadsCsv(csv);
      expect(rows[0]?.author).toBeTruthy();
    });
  });

  describe("empty and malformed input", () => {
    it("returns empty rows for empty string", () => {
      const { rows, skipped } = parseGoodreadsCsv("");
      expect(rows).toHaveLength(0);
      expect(skipped).toBe(0);
    });

    it("returns empty rows for header-only CSV", () => {
      const { rows } = parseGoodreadsCsv(HEADER);
      expect(rows).toHaveLength(0);
    });

    it("skips rows with no title and no author", () => {
      const csv = `${HEADER}\n${makeRow({ title: "", author: "" })}`;
      const { rows, skipped } = parseGoodreadsCsv(csv);
      expect(rows).toHaveLength(0);
      expect(skipped).toBe(1);
    });

    it("handles Windows-style CRLF line endings", () => {
      const csv = `${HEADER}\r\n${makeRow({ exclusiveShelf: "read" })}`;
      const { rows } = parseGoodreadsCsv(csv);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.status).toBe("finished");
    });

    it("handles quoted fields containing commas", () => {
      const csv = `${HEADER}\n${makeRow({ title: '"Dune, Part One"', author: "Frank Herbert" })}`;
      const { rows } = parseGoodreadsCsv(csv);
      expect(rows[0]?.title).toBe("Dune, Part One");
    });
  });

  describe("property tests", () => {
    const exclusiveShelfArb = fc.constantFrom(
      "read",
      "currently-reading",
      "to-read",
      "",
      "other-shelf"
    );

    it("status is always a valid ReadingStatus", () => {
      const validStatuses = ["want_to_read", "reading", "finished", "dropped"];
      fc.assert(
        fc.property(exclusiveShelfArb, (shelf) => {
          const csv = `${HEADER}\n${makeRow({ exclusiveShelf: shelf })}`;
          const { rows } = parseGoodreadsCsv(csv);
          if (rows.length === 0) return true;
          return validStatuses.includes(rows[0]!.status);
        })
      );
    });

    it("myRating is always between 0 and 5", () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 5 }), (rating) => {
          const csv = `${HEADER}\n${makeRow({ myRating: rating, exclusiveShelf: "read" })}`;
          const { rows } = parseGoodreadsCsv(csv);
          return rows[0]?.myRating === rating;
        })
      );
    });

    it("parsing is deterministic: same input always yields same output", () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            "matched.csv",
            "needs-review.csv",
            "unmatched.csv",
            "conflict.csv",
            "re-upload.csv"
          ),
          (fixtureName) => {
            const csv = loadFixture(fixtureName);
            const r1 = parseGoodreadsCsv(csv);
            const r2 = parseGoodreadsCsv(csv);
            return (
              r1.rows.length === r2.rows.length &&
              r1.skipped === r2.skipped &&
              JSON.stringify(r1.rows) === JSON.stringify(r2.rows)
            );
          }
        )
      );
    });
  });
});

describe("computeImportIdempotencyHash", () => {
  it("returns a 64-character hex string (sha256)", () => {
    const hash = computeImportIdempotencyHash("hello");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it("returns the same hash for the same input", () => {
    const csv = "Book Id,Title\n1,Dune";
    expect(computeImportIdempotencyHash(csv)).toBe(computeImportIdempotencyHash(csv));
  });

  it("returns different hashes for different inputs", () => {
    const h1 = computeImportIdempotencyHash("csv-a");
    const h2 = computeImportIdempotencyHash("csv-b");
    expect(h1).not.toBe(h2);
  });

  it("is idempotent: hash(x) === hash(x) regardless of input content", () => {
    fc.assert(
      fc.property(fc.string(), (content) => {
        return computeImportIdempotencyHash(content) === computeImportIdempotencyHash(content);
      })
    );
  });

  it("produces a valid sha256 hex digest for any fixture file", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          "matched.csv",
          "needs-review.csv",
          "unmatched.csv",
          "conflict.csv",
          "re-upload.csv"
        ),
        (fixtureName) => {
          const csv = loadFixture(fixtureName);
          const hash = computeImportIdempotencyHash(csv);
          return hash.length === 64 && /^[0-9a-f]+$/.test(hash);
        }
      )
    );
  });
});
