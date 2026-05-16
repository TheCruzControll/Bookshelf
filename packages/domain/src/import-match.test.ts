import { describe, it, expect, vi } from "vitest";
import * as fc from "fast-check";
import {
  matchImportRow,
  MAX_TITLE_DISTANCE,
  MAX_AUTHOR_SURNAME_DISTANCE,
  type BookLookup,
  type MatchCandidate,
} from "./import-match";
import type { GoodreadsRow } from "./types";

const BOOK_ID_A = "00000000-0000-0000-0000-0000000000aa";
const BOOK_ID_B = "00000000-0000-0000-0000-0000000000bb";

/** Valid ISBN-13 for The Hobbit. */
const HOBBIT_ISBN13 = "9780547928227";

function makeRow(overrides: Partial<GoodreadsRow> = {}): GoodreadsRow {
  return {
    bookId: "1",
    title: "The Hobbit",
    author: "J.R.R. Tolkien",
    additionalAuthors: [],
    isbn10: undefined,
    isbn13: undefined,
    myRating: 0,
    averageRating: 0,
    publisher: undefined,
    binding: undefined,
    numberOfPages: undefined,
    yearPublished: undefined,
    originalPublicationYear: undefined,
    dateRead: undefined,
    dateAdded: undefined,
    bookshelves: [],
    exclusiveShelf: undefined,
    myReview: undefined,
    privateNotes: undefined,
    readCount: 0,
    status: "finished",
    ...overrides,
  };
}

function makeLookup(overrides: Partial<BookLookup> = {}): BookLookup {
  return {
    findByIsbn13: vi.fn().mockResolvedValue(null),
    findByTitleAuthor: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

const HOBBIT_CANDIDATE: MatchCandidate = {
  bookId: BOOK_ID_A,
  title: "The Hobbit",
  author: "J.R.R. Tolkien",
};

describe("matchImportRow — ISBN path", () => {
  it("returns matched with confidence 1 when ISBN-13 hits", async () => {
    const lookup = makeLookup({
      findByIsbn13: vi.fn().mockResolvedValue(HOBBIT_CANDIDATE),
    });

    const result = await matchImportRow(
      makeRow({ isbn13: HOBBIT_ISBN13 }),
      lookup,
    );

    expect(result.bucket).toBe("matched");
    expect(result.confidence).toBe(1);
    if (result.bucket === "matched") {
      expect(result.bookId).toBe(BOOK_ID_A);
    }
    expect(lookup.findByIsbn13).toHaveBeenCalledWith(HOBBIT_ISBN13);
    expect(lookup.findByTitleAuthor).not.toHaveBeenCalled();
  });

  it("falls back to ISBN-10 (canonicalized to ISBN-13) when no ISBN-13 supplied", async () => {
    // ISBN-10 for The Hobbit: 054792822X → ISBN-13 9780547928227.
    const isbn10 = "054792822X";
    const findByIsbn13 = vi.fn().mockResolvedValue(HOBBIT_CANDIDATE);
    const lookup = makeLookup({ findByIsbn13 });

    const result = await matchImportRow(makeRow({ isbn10 }), lookup);

    expect(result.bucket).toBe("matched");
    expect(findByIsbn13).toHaveBeenCalledWith(HOBBIT_ISBN13);
  });

  it("ignores a malformed ISBN-13 and falls through to fuzzy path", async () => {
    const lookup = makeLookup({
      findByIsbn13: vi.fn().mockResolvedValue(null),
      findByTitleAuthor: vi.fn().mockResolvedValue([]),
    });

    const result = await matchImportRow(
      makeRow({ isbn13: "not-a-valid-isbn" }),
      lookup,
    );

    expect(result.bucket).toBe("unmatched");
    expect(lookup.findByIsbn13).not.toHaveBeenCalled();
    expect(lookup.findByTitleAuthor).toHaveBeenCalled();
  });

  it("falls through to fuzzy path when ISBN-13 lookup misses", async () => {
    const lookup = makeLookup({
      findByIsbn13: vi.fn().mockResolvedValue(null),
      findByTitleAuthor: vi.fn().mockResolvedValue([HOBBIT_CANDIDATE]),
    });

    const result = await matchImportRow(
      makeRow({ isbn13: HOBBIT_ISBN13 }),
      lookup,
    );

    expect(result.bucket).toBe("needs_review");
  });
});

describe("matchImportRow — fuzzy path", () => {
  it("returns needs_review for a single in-bound candidate", async () => {
    const candidate: MatchCandidate = {
      bookId: BOOK_ID_A,
      title: "The Hobit", // title distance 1 from "The Hobbit"
      author: "J.R.R. Tolkiens", // surname "tolkiens" vs "tolkien" → distance 1
    };
    const lookup = makeLookup({
      findByTitleAuthor: vi.fn().mockResolvedValue([candidate]),
    });

    const result = await matchImportRow(makeRow(), lookup);

    expect(result.bucket).toBe("needs_review");
    if (result.bucket === "needs_review") {
      expect(result.bookId).toBe(BOOK_ID_A);
      expect(result.candidate).toBe(candidate);
      expect(result.titleDistance).toBe(1);
      expect(result.authorSurnameDistance).toBe(1);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThan(1);
    }
  });

  it("returns unmatched when the title distance exceeds the bound", async () => {
    const candidate: MatchCandidate = {
      bookId: BOOK_ID_A,
      title: "The Lord of the Rings", // far from "The Hobbit"
      author: "J.R.R. Tolkien",
    };
    const lookup = makeLookup({
      findByTitleAuthor: vi.fn().mockResolvedValue([candidate]),
    });

    const result = await matchImportRow(makeRow(), lookup);

    expect(result.bucket).toBe("unmatched");
    expect(result.confidence).toBe(0);
  });

  it("returns unmatched when the author-surname distance exceeds the bound", async () => {
    const candidate: MatchCandidate = {
      bookId: BOOK_ID_A,
      title: "The Hobbit",
      author: "George R. R. Martin", // surname "martin" — far from "tolkien"
    };
    const lookup = makeLookup({
      findByTitleAuthor: vi.fn().mockResolvedValue([candidate]),
    });

    const result = await matchImportRow(makeRow(), lookup);

    expect(result.bucket).toBe("unmatched");
  });

  it("picks the lowest-composite-distance candidate when multiple are in bound", async () => {
    const exact: MatchCandidate = {
      bookId: BOOK_ID_A,
      title: "The Hobbit",
      author: "J.R.R. Tolkien",
    };
    const oneOff: MatchCandidate = {
      bookId: BOOK_ID_B,
      title: "The Hobit",
      author: "J.R.R. Tolkien",
    };
    const lookup = makeLookup({
      findByTitleAuthor: vi.fn().mockResolvedValue([oneOff, exact]),
    });

    const result = await matchImportRow(makeRow(), lookup);

    expect(result.bucket).toBe("needs_review");
    if (result.bucket === "needs_review") {
      expect(result.bookId).toBe(BOOK_ID_A);
      expect(result.titleDistance).toBe(0);
      expect(result.authorSurnameDistance).toBe(0);
    }
  });

  it("accepts Goodreads 'Last, First' author format", async () => {
    const candidate: MatchCandidate = {
      bookId: BOOK_ID_A,
      title: "The Hobbit",
      author: "Tolkien, J.R.R.",
    };
    const lookup = makeLookup({
      findByTitleAuthor: vi.fn().mockResolvedValue([candidate]),
    });

    const result = await matchImportRow(
      makeRow({ author: "J.R.R. Tolkien" }),
      lookup,
    );

    expect(result.bucket).toBe("needs_review");
    if (result.bucket === "needs_review") {
      expect(result.authorSurnameDistance).toBe(0);
    }
  });

  it("treats punctuation and case as equivalent", async () => {
    const candidate: MatchCandidate = {
      bookId: BOOK_ID_A,
      title: "the hobbit!",
      author: "J. R. R. Tolkien",
    };
    const lookup = makeLookup({
      findByTitleAuthor: vi.fn().mockResolvedValue([candidate]),
    });

    const result = await matchImportRow(
      makeRow({ title: "The Hobbit" }),
      lookup,
    );

    expect(result.bucket).toBe("needs_review");
    if (result.bucket === "needs_review") {
      expect(result.titleDistance).toBe(0);
      expect(result.authorSurnameDistance).toBe(0);
    }
  });

  it("returns unmatched when no fuzzy candidates exist", async () => {
    const lookup = makeLookup({
      findByTitleAuthor: vi.fn().mockResolvedValue([]),
    });

    const result = await matchImportRow(makeRow(), lookup);

    expect(result.bucket).toBe("unmatched");
    expect(result.confidence).toBe(0);
  });

  it("returns unmatched when the row has neither title nor author surname", async () => {
    const lookup = makeLookup();
    const result = await matchImportRow(
      makeRow({ title: "", author: "" }),
      lookup,
    );
    expect(result.bucket).toBe("unmatched");
    expect(lookup.findByTitleAuthor).not.toHaveBeenCalled();
  });
});

describe("matchImportRow — confidence score", () => {
  it("ISBN match scores exactly 1", async () => {
    const lookup = makeLookup({
      findByIsbn13: vi.fn().mockResolvedValue(HOBBIT_CANDIDATE),
    });
    const result = await matchImportRow(
      makeRow({ isbn13: HOBBIT_ISBN13 }),
      lookup,
    );
    expect(result.confidence).toBe(1);
  });

  it("exact title and surname score higher than off-by-one matches", async () => {
    const exactLookup = makeLookup({
      findByTitleAuthor: vi.fn().mockResolvedValue([HOBBIT_CANDIDATE]),
    });
    const offLookup = makeLookup({
      findByTitleAuthor: vi.fn().mockResolvedValue([
        { bookId: BOOK_ID_A, title: "The Hobit", author: "J.R.R. Tolkien" },
      ]),
    });

    const exact = await matchImportRow(makeRow(), exactLookup);
    const off = await matchImportRow(makeRow(), offLookup);

    expect(exact.bucket).toBe("needs_review");
    expect(off.bucket).toBe("needs_review");
    if (exact.bucket === "needs_review" && off.bucket === "needs_review") {
      expect(exact.confidence).toBeGreaterThan(off.confidence);
    }
  });

  it("unmatched results score exactly 0", async () => {
    const result = await matchImportRow(makeRow(), makeLookup());
    expect(result.confidence).toBe(0);
  });
});

describe("matchImportRow — property tests", () => {
  // Generators that only emit ASCII letter strings keep distances meaningful
  // and avoid pathological Unicode whitespace normalization.
  const letters = "abcdefghijklmnopqrstuvwxyz";
  const wordArb = fc
    .stringMatching(/^[a-z]+$/)
    .filter((s) => s.length >= 2 && s.length <= 12);
  void letters; // (kept for readability of regex above)

  it("identical title+author always lands in needs_review when only that candidate exists", async () => {
    await fc.assert(
      fc.asyncProperty(wordArb, wordArb, async (title, surname) => {
        const row = makeRow({ title, author: surname });
        const candidate: MatchCandidate = {
          bookId: BOOK_ID_A,
          title,
          author: surname,
        };
        const lookup = makeLookup({
          findByTitleAuthor: vi.fn().mockResolvedValue([candidate]),
        });
        const result = await matchImportRow(row, lookup);
        expect(result.bucket).toBe("needs_review");
        if (result.bucket === "needs_review") {
          expect(result.titleDistance).toBe(0);
          expect(result.authorSurnameDistance).toBe(0);
        }
      }),
    );
  });

  it("off-by-one author surname is still in bound", async () => {
    await fc.assert(
      fc.asyncProperty(wordArb, wordArb, async (title, surname) => {
        const tweakedSurname = surname + "x"; // distance 1
        const row = makeRow({ title, author: surname });
        const candidate: MatchCandidate = {
          bookId: BOOK_ID_A,
          title,
          author: tweakedSurname,
        };
        const lookup = makeLookup({
          findByTitleAuthor: vi.fn().mockResolvedValue([candidate]),
        });
        const result = await matchImportRow(row, lookup);
        expect(result.bucket).toBe("needs_review");
        if (result.bucket === "needs_review") {
          expect(result.authorSurnameDistance).toBeLessThanOrEqual(
            MAX_AUTHOR_SURNAME_DISTANCE,
          );
        }
      }),
    );
  });

  it("author surname differing by more than the bound never matches", async () => {
    await fc.assert(
      fc.asyncProperty(wordArb, wordArb, async (title, surname) => {
        // Append three distinct characters to push surname distance to 3.
        const farSurname = surname + "xyz";
        const row = makeRow({ title, author: surname });
        const candidate: MatchCandidate = {
          bookId: BOOK_ID_A,
          title,
          author: farSurname,
        };
        const lookup = makeLookup({
          findByTitleAuthor: vi.fn().mockResolvedValue([candidate]),
        });
        const result = await matchImportRow(row, lookup);
        expect(result.bucket).toBe("unmatched");
      }),
    );
  });

  it("title differing by more than 2 edits never matches", async () => {
    await fc.assert(
      fc.asyncProperty(
        wordArb.filter((s) => s.length >= 4),
        wordArb,
        async (title, surname) => {
          const farTitle = title + "xyzw"; // distance 4
          const row = makeRow({ title, author: surname });
          const candidate: MatchCandidate = {
            bookId: BOOK_ID_A,
            title: farTitle,
            author: surname,
          };
          const lookup = makeLookup({
            findByTitleAuthor: vi.fn().mockResolvedValue([candidate]),
          });
          const result = await matchImportRow(row, lookup);
          expect(result.bucket).toBe("unmatched");
        },
      ),
    );
  });

  it("confidence is always in [0, 1]", async () => {
    await fc.assert(
      fc.asyncProperty(
        wordArb,
        wordArb,
        fc.integer({ min: 0, max: MAX_TITLE_DISTANCE }),
        fc.integer({ min: 0, max: MAX_AUTHOR_SURNAME_DISTANCE }),
        async (title, surname, titlePad, surnamePad) => {
          const candidate: MatchCandidate = {
            bookId: BOOK_ID_A,
            title: title + "z".repeat(titlePad),
            author: surname + "z".repeat(surnamePad),
          };
          const lookup = makeLookup({
            findByTitleAuthor: vi.fn().mockResolvedValue([candidate]),
          });
          const result = await matchImportRow(
            makeRow({ title, author: surname }),
            lookup,
          );
          expect(result.confidence).toBeGreaterThanOrEqual(0);
          expect(result.confidence).toBeLessThanOrEqual(1);
        },
      ),
    );
  });
});
