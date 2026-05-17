import { normalizeIsbn } from "@hone/domain/isbn";
import type { BooksCreateManualInput } from "@hone/domain";

/**
 * Submission payload mirrors `BooksCreateManualInputSchema` (#75) so the
 * server can accept it 1:1 once a tRPC client is wired in. Optional
 * fields are omitted (not set to `undefined`) when blank so the schema's
 * `.optional()` branches are exercised cleanly.
 */
export type ManualBookSubmission = BooksCreateManualInput;

export interface FieldErrors {
  title?: string;
  authors?: string;
  isbn?: string;
  year?: string;
  coverUrl?: string;
}

/**
 * Raw, string-typed form state. Mirrors what the controlled inputs hold
 * before validation. Exposed so tests can exercise the validator without
 * mounting the form.
 */
export interface ManualBookFormState {
  title: string;
  authors: ReadonlyArray<string>;
  isbn: string;
  year: string;
  coverUrl: string;
}

export interface ValidationResult {
  ok: boolean;
  payload?: ManualBookSubmission;
  errors: FieldErrors;
}

export const MAX_AUTHORS = 20;
export const MAX_AUTHOR_LEN = 200;
export const MAX_TITLE_LEN = 500;
export const MAX_COVER_LEN = 2048;

/**
 * Validates a parsed year string against the server-side schema bounds
 * (`int >= 0, <= 9999`). Returns the parsed integer or an error message.
 */
export function validateYear(raw: string): { value?: number; error?: string } {
  const trimmed = raw.trim();
  if (trimmed === "") return {};
  if (!/^\d+$/.test(trimmed)) {
    return { error: "Year must be a whole number." };
  }
  const value = parseInt(trimmed, 10);
  if (value < 0 || value > 9999) {
    return { error: "Year must be between 0 and 9999." };
  }
  return { value };
}

/**
 * Validates a cover URL. Empty -> ok. Otherwise the URL constructor is
 * the source of truth; we also bound the length to match the schema.
 */
export function validateCoverUrl(raw: string): { value?: string; error?: string } {
  const trimmed = raw.trim();
  if (trimmed === "") return {};
  if (trimmed.length > MAX_COVER_LEN) {
    return { error: "Cover URL is too long." };
  }
  try {
    // The URL constructor is the same source of truth Zod's `.url()` uses.
    new URL(trimmed);
  } catch {
    return { error: "Cover URL must be a valid URL (e.g. https://...)." };
  }
  return { value: trimmed };
}

/**
 * Validates an ISBN using the shared domain helper. Empty -> ok.
 * `normalizeIsbn` enforces length (10 or 13) and checksum; we delegate to
 * it so client and server agree on what counts as a valid ISBN.
 */
export function validateIsbn(raw: string): { value?: string; error?: string } {
  const trimmed = raw.trim();
  if (trimmed === "") return {};
  try {
    normalizeIsbn(trimmed);
  } catch {
    return {
      error: "ISBN must be a valid 10- or 13-digit ISBN with a correct checksum.",
    };
  }
  // Keep the raw input — the server re-normalizes via `BookService.createManual`.
  return { value: trimmed };
}

/**
 * Pure validator over the raw form state. Mirrors `BooksCreateManualInputSchema`
 * (#75) at the field level so client-side errors line up with what the
 * server rejects. Ported verbatim from the web counterpart
 * (`apps/web/app/books/new/ManualBookForm.tsx`) so native and web reject
 * the same inputs with the same error copy.
 *
 * Lives in its own module (no react-native imports) so the vitest Node
 * environment can exercise the full validator matrix without dragging in
 * the RN runtime.
 */
export function validateManualBookState(
  state: ManualBookFormState,
): ValidationResult {
  const errors: FieldErrors = {};

  const titleTrimmed = state.title.trim();
  if (titleTrimmed.length === 0) {
    errors.title = "Title is required.";
  } else if (titleTrimmed.length > MAX_TITLE_LEN) {
    errors.title = `Title must be ${MAX_TITLE_LEN} characters or fewer.`;
  }

  const nonBlankAuthors = state.authors
    .map((a) => a.trim())
    .filter((a) => a !== "");
  if (nonBlankAuthors.length === 0) {
    errors.authors = "Add at least one author.";
  } else if (nonBlankAuthors.length > MAX_AUTHORS) {
    errors.authors = `At most ${MAX_AUTHORS} authors.`;
  } else if (nonBlankAuthors.some((a) => a.length > MAX_AUTHOR_LEN)) {
    errors.authors = `Each author name must be ${MAX_AUTHOR_LEN} characters or fewer.`;
  }

  const isbnResult = validateIsbn(state.isbn);
  if (isbnResult.error) errors.isbn = isbnResult.error;

  const yearResult = validateYear(state.year);
  if (yearResult.error) errors.year = yearResult.error;

  const coverResult = validateCoverUrl(state.coverUrl);
  if (coverResult.error) errors.coverUrl = coverResult.error;

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  const payload: ManualBookSubmission = {
    title: titleTrimmed,
    authors: nonBlankAuthors,
  };
  if (isbnResult.value !== undefined) payload.isbn = isbnResult.value;
  if (yearResult.value !== undefined) payload.year = yearResult.value;
  if (coverResult.value !== undefined) payload.coverUrl = coverResult.value;

  return { ok: true, payload, errors };
}
