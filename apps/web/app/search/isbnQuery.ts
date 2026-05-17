/**
 * Helpers used by the /search input to decide whether the current query
 * looks like an ISBN lookup (`catalog.byIsbn`) or a free-text title/author
 * search (`catalog.search`).
 *
 * Detection is intentionally permissive: users paste ISBNs with spaces or
 * hyphens ("978-0-553-29335-0", "0 553 29335 4"), so we strip those before
 * checking shape. We do **not** validate the checksum here — the catalog
 * backend (`@hone/domain.normalizeIsbn`) is the source of truth for that.
 * Our only job is to route the right query to the right tRPC procedure.
 */

/** Strip spaces and ASCII hyphens; uppercase any trailing `x` check digit. */
export function stripIsbnFormatting(value: string): string {
  return value.replace(/[\s-]/g, "").toUpperCase();
}

/** True when the stripped value is exactly 13 ASCII digits. */
export function looksLikeIsbn13(value: string): boolean {
  const stripped = stripIsbnFormatting(value);
  return /^\d{13}$/.test(stripped);
}

/**
 * True when the stripped value is exactly 10 characters of ASCII digits,
 * optionally ending in `X` (the ISBN-10 check character).
 */
export function looksLikeIsbn10(value: string): boolean {
  const stripped = stripIsbnFormatting(value);
  return /^\d{9}[\dX]$/.test(stripped);
}

/** True when the input shape matches ISBN-10 or ISBN-13. */
export function looksLikeIsbn(value: string): boolean {
  return looksLikeIsbn13(value) || looksLikeIsbn10(value);
}

export type ParsedQuery =
  | { kind: "empty" }
  | { kind: "isbn"; isbn: string }
  | { kind: "text"; query: string };

/**
 * Classify a raw search-box value into one of:
 *  - `empty` — whitespace-only, do nothing
 *  - `isbn`  — call `catalog.byIsbn(isbn)` with the formatting-stripped value
 *  - `text`  — call `catalog.search(query)` with the trimmed original
 */
export function parseSearchQuery(raw: string): ParsedQuery {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { kind: "empty" };
  if (looksLikeIsbn(trimmed)) {
    return { kind: "isbn", isbn: stripIsbnFormatting(trimmed) };
  }
  return { kind: "text", query: trimmed };
}
