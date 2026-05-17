import { describe, it, expect, vi } from "vitest";
import { BookService } from "./services";
import type { BookRepository } from "./ports";
import type { Book, Edition } from "./types";

const NOW = new Date("2026-05-17T00:00:00Z");
const BOOK_ID = "00000000-0000-0000-0000-000000000010";
const EDITION_ID = "00000000-0000-0000-0000-000000000011";

function makeBook(overrides?: Partial<Book>): Book {
  return {
    id: BOOK_ID,
    canonicalTitle: "Manual Title",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeEdition(overrides?: Partial<Edition>): Edition {
  return {
    id: EDITION_ID,
    bookId: BOOK_ID,
    title: "Manual Title",
    source: "manual",
    ...overrides,
  };
}

function makeBookRepo(overrides?: Partial<BookRepository>): BookRepository {
  return {
    findBookById: vi.fn(),
    findEditionByIsbn: vi.fn(),
    findBookByIsbn13: vi.fn().mockResolvedValue(null),
    search: vi.fn(),
    upsertFromCatalogResult: vi.fn(),
    createManual: vi.fn().mockResolvedValue({ book: makeBook(), edition: makeEdition() }),
    ...overrides,
  };
}

describe("BookService.createManual", () => {
  it("creates a manual Book + Edition when input is valid", async () => {
    const repo = makeBookRepo();
    const service = new BookService(repo);

    const result = await service.createManual({
      title: "The Great Gatsby",
      authors: ["F. Scott Fitzgerald"],
    });

    expect(result.book.id).toBe(BOOK_ID);
    expect(result.edition.source).toBe("manual");
    expect(repo.createManual).toHaveBeenCalledWith({
      title: "The Great Gatsby",
      authors: ["F. Scott Fitzgerald"],
      isbn13: undefined,
      firstPublishedYear: undefined,
      coverUrl: undefined,
    });
  });

  it("trims whitespace from title and author entries before passing to repo", async () => {
    const repo = makeBookRepo();
    const service = new BookService(repo);

    await service.createManual({
      title: "  The Great Gatsby  ",
      authors: ["  Fitzgerald  ", ""],
    });

    expect(repo.createManual).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "The Great Gatsby",
        authors: ["Fitzgerald"],
      })
    );
  });

  it("normalizes ISBN-10 to ISBN-13 before passing to repo", async () => {
    const repo = makeBookRepo();
    const service = new BookService(repo);

    // 0743273567 is the canonical ISBN-10 for The Great Gatsby; it
    // normalizes to 9780743273565 via the 978-prefix transform.
    await service.createManual({
      title: "Gatsby",
      authors: ["Fitzgerald"],
      isbn: "0-7432-7356-7",
    });

    expect(repo.createManual).toHaveBeenCalledWith(
      expect.objectContaining({ isbn13: "9780743273565" })
    );
  });

  it("accepts a hyphenated ISBN-13", async () => {
    const repo = makeBookRepo();
    const service = new BookService(repo);

    await service.createManual({
      title: "Gatsby",
      authors: ["Fitzgerald"],
      isbn: "978-0-7432-7356-5",
    });

    expect(repo.createManual).toHaveBeenCalledWith(
      expect.objectContaining({ isbn13: "9780743273565" })
    );
  });

  it("passes year and coverUrl through to the repo when supplied", async () => {
    const repo = makeBookRepo();
    const service = new BookService(repo);

    await service.createManual({
      title: "Gatsby",
      authors: ["Fitzgerald"],
      year: 1925,
      coverUrl: "https://example.com/gatsby.jpg",
    });

    expect(repo.createManual).toHaveBeenCalledWith(
      expect.objectContaining({
        firstPublishedYear: 1925,
        coverUrl: "https://example.com/gatsby.jpg",
      })
    );
  });

  it("throws INVALID_INPUT when title is empty after trimming", async () => {
    const repo = makeBookRepo();
    const service = new BookService(repo);

    await expect(
      service.createManual({ title: "   ", authors: ["Fitzgerald"] })
    ).rejects.toMatchObject({ code: "INVALID_INPUT", message: "Title is required" });
    expect(repo.createManual).not.toHaveBeenCalled();
  });

  it("throws INVALID_INPUT when authors array is empty", async () => {
    const repo = makeBookRepo();
    const service = new BookService(repo);

    await expect(
      service.createManual({ title: "Gatsby", authors: [] })
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(repo.createManual).not.toHaveBeenCalled();
  });

  it("throws INVALID_INPUT when every author entry is blank", async () => {
    const repo = makeBookRepo();
    const service = new BookService(repo);

    await expect(
      service.createManual({ title: "Gatsby", authors: ["", "  "] })
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(repo.createManual).not.toHaveBeenCalled();
  });

  it("throws INVALID_INPUT when ISBN fails checksum validation", async () => {
    const repo = makeBookRepo();
    const service = new BookService(repo);

    await expect(
      service.createManual({
        title: "Gatsby",
        authors: ["Fitzgerald"],
        // 9780743273566 has a deliberately-wrong final check digit.
        isbn: "9780743273566",
      })
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(repo.createManual).not.toHaveBeenCalled();
  });

  it("throws INVALID_INPUT when ISBN is the wrong length", async () => {
    const repo = makeBookRepo();
    const service = new BookService(repo);

    await expect(
      service.createManual({
        title: "Gatsby",
        authors: ["Fitzgerald"],
        isbn: "12345",
      })
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(repo.createManual).not.toHaveBeenCalled();
  });

  it("treats a blank ISBN as absent (does not attempt to normalize)", async () => {
    const repo = makeBookRepo();
    const service = new BookService(repo);

    await service.createManual({
      title: "Gatsby",
      authors: ["Fitzgerald"],
      isbn: "   ",
    });

    expect(repo.createManual).toHaveBeenCalledWith(
      expect.objectContaining({ isbn13: undefined })
    );
  });
});
