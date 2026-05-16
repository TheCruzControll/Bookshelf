import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { planCatalogMerge } from "./catalog-merge";
import type { Book, BookSearchResult } from "./types";

function makeOLResult(overrides: Partial<BookSearchResult> = {}): BookSearchResult {
  return {
    source: "open_library",
    sourceKey: "/works/OL1W",
    title: "Test Book",
    authors: ["Author One"],
    isbn13: "9780743273565",
    workId: "OL1W",
    ...overrides,
  };
}

function makeGBResult(overrides: Partial<BookSearchResult> = {}): BookSearchResult {
  return {
    source: "google_books",
    sourceKey: "vol_1",
    title: "Test Book",
    authors: ["Author One"],
    isbn13: "9780743273565",
    ...overrides,
  };
}

function makeBook(overrides: Partial<Book> = {}): Book {
  const now = new Date("2026-01-01T00:00:00Z");
  return {
    id: "book-1",
    canonicalTitle: "Test Book",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("planCatalogMerge", () => {
  describe("no existing book — create path", () => {
    it("creates a new book carrying OL workId when result is an OL hit", () => {
      const result = makeOLResult({ workId: "OL45804W" });
      const plan = planCatalogMerge(result, null);

      expect(plan.book.kind).toBe("create");
      if (plan.book.kind !== "create") throw new Error("unreachable");
      expect(plan.book.attributes.canonicalTitle).toBe("Test Book");
      expect(plan.book.attributes.olWorkId).toBe("OL45804W");
    });

    it("creates a new book with undefined olWorkId when result is a GB hit", () => {
      const result = makeGBResult();
      const plan = planCatalogMerge(result, null);

      expect(plan.book.kind).toBe("create");
      if (plan.book.kind !== "create") throw new Error("unreachable");
      expect(plan.book.attributes.olWorkId).toBeUndefined();
    });

    it("creates a new book with undefined olWorkId when OL result lacks workId", () => {
      const result = makeOLResult({ workId: undefined });
      const plan = planCatalogMerge(result, null);

      if (plan.book.kind !== "create") throw new Error("unreachable");
      expect(plan.book.attributes.olWorkId).toBeUndefined();
    });

    it("always emits an Edition upsert reflecting the result", () => {
      const result = makeOLResult({
        isbn10: "0743273567",
        isbn13: "9780743273565",
        publisher: "Scribner",
        publishedDate: "2004",
        pageCount: 180,
      });
      const plan = planCatalogMerge(result, null);

      expect(plan.edition).toEqual({
        isbn10: "0743273567",
        isbn13: "9780743273565",
        title: "Test Book",
        publisher: "Scribner",
        publishedDate: "2004",
        pageCount: 180,
        source: "open_library",
        sourceKey: "/works/OL1W",
      });
    });
  });

  describe("existing book — update path", () => {
    it("emits empty patch when existing book already has the workId set", () => {
      const existing = makeBook({ olWorkId: "OL45804W" });
      const result = makeOLResult({ workId: "OL45804W" });
      const plan = planCatalogMerge(result, existing);

      expect(plan.book.kind).toBe("update");
      if (plan.book.kind !== "update") throw new Error("unreachable");
      expect(plan.book.bookId).toBe(existing.id);
      expect(plan.book.patch).toEqual({});
    });

    it("emits empty patch when new result is a GB hit (no workId to merge)", () => {
      const existing = makeBook({ olWorkId: undefined });
      const result = makeGBResult();
      const plan = planCatalogMerge(result, existing);

      if (plan.book.kind !== "update") throw new Error("unreachable");
      expect(plan.book.patch).toEqual({});
    });

    it("back-fills olWorkId when existing was GB-sourced and new result is OL with workId", () => {
      const existing = makeBook({ olWorkId: undefined });
      const result = makeOLResult({ workId: "OL45804W" });
      const plan = planCatalogMerge(result, existing);

      if (plan.book.kind !== "update") throw new Error("unreachable");
      expect(plan.book.patch).toEqual({ olWorkId: "OL45804W" });
    });

    it("does NOT overwrite an existing non-null olWorkId even if new workId differs", () => {
      const existing = makeBook({ olWorkId: "OL45804W" });
      const result = makeOLResult({ workId: "OL99999W" });
      const plan = planCatalogMerge(result, existing);

      if (plan.book.kind !== "update") throw new Error("unreachable");
      // Authoritative-once policy: never overwrite.
      expect(plan.book.patch).toEqual({});
    });

    it("does NOT back-fill when new OL result has no workId itself", () => {
      const existing = makeBook({ olWorkId: undefined });
      const result = makeOLResult({ workId: undefined });
      const plan = planCatalogMerge(result, existing);

      if (plan.book.kind !== "update") throw new Error("unreachable");
      expect(plan.book.patch).toEqual({});
    });

    it("emits an Edition upsert pointing at the existing book", () => {
      const existing = makeBook({ id: "existing-book-id", olWorkId: "OL45804W" });
      const result = makeGBResult({ sourceKey: "vol_2" });
      const plan = planCatalogMerge(result, existing);

      expect(plan.edition.source).toBe("google_books");
      expect(plan.edition.sourceKey).toBe("vol_2");
      if (plan.book.kind !== "update") throw new Error("unreachable");
      expect(plan.book.bookId).toBe("existing-book-id");
    });
  });

  describe("acceptance scenarios from #72", () => {
    it("same ISBN-13 across OL + GB — second result hangs off the same book", () => {
      // 1st ingest: OL result, no existing book.
      const firstResult = makeOLResult({ isbn13: "9780743273565", workId: "OL45804W" });
      const firstPlan = planCatalogMerge(firstResult, null);
      expect(firstPlan.book.kind).toBe("create");

      // Caller persists and now has a Book row.
      const persistedBook = makeBook({
        id: "book-uuid",
        olWorkId: "OL45804W",
      });

      // 2nd ingest: GB result with the same ISBN-13. Existing Book is found.
      const secondResult = makeGBResult({ isbn13: "9780743273565" });
      const secondPlan = planCatalogMerge(secondResult, persistedBook);

      if (secondPlan.book.kind !== "update") throw new Error("unreachable");
      expect(secondPlan.book.bookId).toBe("book-uuid");
      // Both editions attach to the same book; no Book mutation needed.
      expect(secondPlan.book.patch).toEqual({});
    });

    it("GB first then OL — OL workId back-fills the GB-sourced book", () => {
      // 1st ingest: GB result, nothing existing.
      const gbResult = makeGBResult({ isbn13: "9780743273565" });
      const firstPlan = planCatalogMerge(gbResult, null);
      if (firstPlan.book.kind !== "create") throw new Error("unreachable");
      expect(firstPlan.book.attributes.olWorkId).toBeUndefined();

      // 2nd ingest: OL result with same ISBN-13. Existing book has no workId.
      const persistedBook = makeBook({
        id: "book-uuid",
        olWorkId: undefined,
      });
      const olResult = makeOLResult({ isbn13: "9780743273565", workId: "OL45804W" });
      const secondPlan = planCatalogMerge(olResult, persistedBook);

      if (secondPlan.book.kind !== "update") throw new Error("unreachable");
      expect(secondPlan.book.patch).toEqual({ olWorkId: "OL45804W" });
    });

    it("OL twice in a row — idempotent, no patch on second pass", () => {
      // 1st ingest: OL result, no existing book.
      const firstResult = makeOLResult({ workId: "OL45804W" });
      const firstPlan = planCatalogMerge(firstResult, null);
      if (firstPlan.book.kind !== "create") throw new Error("unreachable");
      expect(firstPlan.book.attributes.olWorkId).toBe("OL45804W");

      // 2nd ingest: same OL result, book now persisted.
      const persistedBook = makeBook({
        id: "book-uuid",
        olWorkId: "OL45804W",
      });
      const secondPlan = planCatalogMerge(firstResult, persistedBook);

      if (secondPlan.book.kind !== "update") throw new Error("unreachable");
      expect(secondPlan.book.bookId).toBe("book-uuid");
      expect(secondPlan.book.patch).toEqual({});
    });
  });

  describe("property: catalog has one Book per distinct ISBN-13", () => {
    /**
     * Simulate a sequence of ingests against an in-memory catalog and assert
     * that the final catalog has exactly one Book per distinct ISBN-13 — the
     * core acceptance criterion of #72.
     */
    function simulateIngests(
      results: BookSearchResult[]
    ): { books: Book[]; editions: Array<{ bookId: string; source: string; sourceKey: string | undefined }> } {
      const isbnIndex = new Map<string, Book>();
      const bookList: Book[] = [];
      const editionList: Array<{
        bookId: string;
        source: string;
        sourceKey: string | undefined;
      }> = [];
      let nextId = 0;

      for (const result of results) {
        const existing = result.isbn13 ? isbnIndex.get(result.isbn13) ?? null : null;
        const plan = planCatalogMerge(result, existing);

        let bookId: string;
        if (plan.book.kind === "create") {
          bookId = `book-${nextId++}`;
          const newBook: Book = {
            id: bookId,
            canonicalTitle: plan.book.attributes.canonicalTitle,
            subtitle: plan.book.attributes.subtitle,
            description: plan.book.attributes.description,
            coverUrl: plan.book.attributes.coverUrl,
            firstPublishedYear: plan.book.attributes.firstPublishedYear,
            olWorkId: plan.book.attributes.olWorkId,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          bookList.push(newBook);
          if (result.isbn13) {
            isbnIndex.set(result.isbn13, newBook);
          }
        } else {
          bookId = plan.book.bookId;
          if (plan.book.patch.olWorkId !== undefined) {
            const idx = bookList.findIndex((b) => b.id === bookId);
            if (idx >= 0) {
              bookList[idx] = { ...bookList[idx]!, olWorkId: plan.book.patch.olWorkId };
              if (result.isbn13) {
                isbnIndex.set(result.isbn13, bookList[idx]!);
              }
            }
          }
        }

        editionList.push({
          bookId,
          source: plan.edition.source,
          sourceKey: plan.edition.sourceKey,
        });
      }

      return { books: bookList, editions: editionList };
    }

    const arbResult = fc.record({
      source: fc.constantFrom("open_library" as const, "google_books" as const),
      sourceKey: fc.string({ minLength: 1, maxLength: 12 }),
      title: fc.string({ minLength: 1, maxLength: 30 }),
      isbn13: fc.option(
        fc.stringMatching(/^[0-9]{13}$/),
        { nil: undefined }
      ),
      workId: fc.option(
        fc.stringMatching(/^OL[0-9]{1,6}W$/),
        { nil: undefined }
      ),
    });

    it("any sequence of results yields exactly one Book per distinct ISBN-13", () => {
      fc.assert(
        fc.property(
          fc.array(arbResult, { minLength: 0, maxLength: 30 }),
          (rawResults) => {
            // Build well-formed BookSearchResult values from the arbitrary record.
            // workId only valid for OL results.
            const results: BookSearchResult[] = rawResults.map((r) => ({
              source: r.source,
              sourceKey: r.sourceKey,
              title: r.title,
              authors: [],
              isbn13: r.isbn13,
              workId: r.source === "open_library" ? r.workId : undefined,
            }));

            const { books, editions } = simulateIngests(results);

            // Property 1: one Book per distinct ISBN-13 (results with undefined
            // ISBN are allowed to create their own books — that's expected,
            // they're not yet merge-able).
            const distinctIsbns = new Set(
              results.map((r) => r.isbn13).filter((v): v is string => v !== undefined)
            );
            const booksWithIsbn = new Set<string>();
            for (const e of editions) {
              const r = results[editions.indexOf(e)]!;
              if (r.isbn13) booksWithIsbn.add(e.bookId);
            }
            expect(booksWithIsbn.size).toBe(distinctIsbns.size);

            // Property 2: each ISBN-13 maps to exactly one book id across all editions.
            const isbnToBookId = new Map<string, string>();
            results.forEach((r, i) => {
              if (!r.isbn13) return;
              const e = editions[i]!;
              const prior = isbnToBookId.get(r.isbn13);
              if (prior === undefined) {
                isbnToBookId.set(r.isbn13, e.bookId);
              } else {
                expect(e.bookId).toBe(prior);
              }
            });

            // Property 3: once a book has an olWorkId it never loses it.
            // (We track this by recomputing book olWorkIds across results.)
            const finalById = new Map(books.map((b) => [b.id, b]));
            for (const r of results) {
              if (!r.isbn13) continue;
              const bookId = isbnToBookId.get(r.isbn13);
              if (!bookId) continue;
              const finalBook = finalById.get(bookId);
              if (!finalBook) continue;
              if (r.source === "open_library" && r.workId !== undefined) {
                // After any OL hit with a workId, the book must carry SOME
                // olWorkId (the first one seen — never overwritten).
                expect(finalBook.olWorkId).toBeDefined();
              }
            }
          }
        )
      );
    });
  });
});
