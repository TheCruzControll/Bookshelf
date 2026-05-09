import type { GoodreadsRow, ReadingStatus } from "./types";

const COLUMN_ALIASES: Record<string, string> = {
  "book id": "book id",
  "bookid": "book id",
  "title": "title",
  "author": "author",
  "author l-f": "author l-f",
  "author (last, first)": "author l-f",
  "additional authors": "additional authors",
  "isbn": "isbn",
  "isbn10": "isbn",
  "isbn13": "isbn13",
  "my rating": "my rating",
  "myrating": "my rating",
  "average rating": "average rating",
  "avgrating": "average rating",
  "publisher": "publisher",
  "binding": "binding",
  "number of pages": "number of pages",
  "num pages": "number of pages",
  "pages": "number of pages",
  "year published": "year published",
  "original publication year": "original publication year",
  "date read": "date read",
  "date added": "date added",
  "bookshelves": "bookshelves",
  "bookshelves with positions": "bookshelves with positions",
  "exclusive shelf": "exclusive shelf",
  "my review": "my review",
  "review": "my review",
  "spoiler": "spoiler",
  "private notes": "private notes",
  "read count": "read count",
  "owned copies": "owned copies",
};

function normalizeColumnName(raw: string): string {
  const key = raw.trim().toLowerCase();
  return COLUMN_ALIASES[key] ?? key;
}

function stripIsbnFormatting(value: string): string {
  return value.replace(/^=/, "").trim();
}

function parseOptionalInt(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const n = parseInt(trimmed, 10);
  return isNaN(n) ? undefined : n;
}

function parseOptionalDate(value: string): Date | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const d = new Date(trimmed);
  return isNaN(d.getTime()) ? undefined : d;
}

function parseBookshelves(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const EXCLUSIVE_SHELF_STATUS_MAP: Record<string, ReadingStatus> = {
  "read": "finished",
  "currently-reading": "reading",
  "to-read": "want_to_read",
};

const SHELF_STATUS_FALLBACK_MAP: Record<string, ReadingStatus> = {
  "read": "finished",
  "currently-reading": "reading",
  "to-read": "want_to_read",
  "reading": "reading",
  "finished": "finished",
  "want-to-read": "want_to_read",
  "want_to_read": "want_to_read",
  "dropped": "dropped",
  "did-not-finish": "dropped",
  "dnf": "dropped",
};

function normalizeStatus(
  exclusiveShelf: string | undefined,
  bookshelves: string[]
): ReadingStatus {
  if (exclusiveShelf) {
    const normalized = exclusiveShelf.trim().toLowerCase();
    const mapped = EXCLUSIVE_SHELF_STATUS_MAP[normalized];
    if (mapped) return mapped;
  }

  for (const shelf of bookshelves) {
    const normalized = shelf.trim().toLowerCase();
    const mapped = SHELF_STATUS_FALLBACK_MAP[normalized];
    if (mapped) return mapped;
  }

  return "want_to_read";
}

function parseRow(
  headers: string[],
  rawValues: string[]
): GoodreadsRow {
  const row: Record<string, string> = {};
  for (let i = 0; i < headers.length; i++) {
    row[headers[i]!] = rawValues[i] ?? "";
  }

  const bookId = row["book id"]?.trim() ?? "";
  const title = row["title"]?.trim() ?? "";
  const author = row["author"]?.trim() ?? "";

  const additionalAuthorsRaw = row["additional authors"]?.trim() ?? "";
  const additionalAuthors = additionalAuthorsRaw
    ? additionalAuthorsRaw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    : [];

  const isbn10Raw = stripIsbnFormatting(row["isbn"] ?? "");
  const isbn10 = isbn10Raw.length > 0 ? isbn10Raw : undefined;

  const isbn13Raw = stripIsbnFormatting(row["isbn13"] ?? "");
  const isbn13 = isbn13Raw.length > 0 ? isbn13Raw : undefined;

  const myRating = parseOptionalInt(row["my rating"] ?? "") ?? 0;
  const averageRating =
    parseFloat((row["average rating"] ?? "").trim()) || 0;

  const publisher =
    (row["publisher"]?.trim() || undefined);
  const binding =
    (row["binding"]?.trim() || undefined);

  const numberOfPages = parseOptionalInt(row["number of pages"] ?? "");
  const yearPublished = parseOptionalInt(row["year published"] ?? "");
  const originalPublicationYear = parseOptionalInt(
    row["original publication year"] ?? ""
  );

  const dateRead = parseOptionalDate(row["date read"] ?? "");
  const dateAdded = parseOptionalDate(row["date added"] ?? "");

  const bookshelvesRaw = row["bookshelves"]?.trim() ?? "";
  const bookshelves = parseBookshelves(bookshelvesRaw);

  const exclusiveShelf =
    (row["exclusive shelf"]?.trim() || undefined);

  const myReview = (row["my review"]?.trim() || undefined);
  const privateNotes = (row["private notes"]?.trim() || undefined);

  const readCount = parseOptionalInt(row["read count"] ?? "") ?? 0;

  const status = normalizeStatus(exclusiveShelf, bookshelves);

  return {
    bookId,
    title,
    author,
    additionalAuthors,
    isbn10,
    isbn13,
    myRating,
    averageRating,
    publisher,
    binding,
    numberOfPages,
    yearPublished,
    originalPublicationYear,
    dateRead,
    dateAdded,
    bookshelves,
    exclusiveShelf,
    myReview,
    privateNotes,
    readCount,
    status,
  };
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const ch = line[i]!;

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 2;
        continue;
      }
      inQuotes = !inQuotes;
      i++;
      continue;
    }

    if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
      i++;
      continue;
    }

    current += ch;
    i++;
  }

  result.push(current);
  return result;
}

export interface GoodreadsParseResult {
  rows: GoodreadsRow[];
  skipped: number;
}

export function parseGoodreadsCsv(csv: string): GoodreadsParseResult {
  const lines = csv.split(/\r?\n/);

  if (lines.length === 0) {
    return { rows: [], skipped: 0 };
  }

  const headerLine = lines[0];
  if (!headerLine) {
    return { rows: [], skipped: 0 };
  }

  const rawHeaders = splitCsvLine(headerLine);
  const headers = rawHeaders.map(normalizeColumnName);

  const rows: GoodreadsRow[] = [];
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;

    const rawValues = splitCsvLine(line);

    const title = rawValues[headers.indexOf("title")]?.trim() ?? "";
    const author = rawValues[headers.indexOf("author")]?.trim() ?? "";
    if (!title && !author) {
      skipped++;
      continue;
    }

    const row = parseRow(headers, rawValues);
    rows.push(row);
  }

  return { rows, skipped };
}
