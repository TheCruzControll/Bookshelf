"use client";

import { useState } from "react";
import { normalizeIsbn } from "@hone/domain/isbn";
import type { BooksCreateManualInput } from "@hone/domain";

/**
 * Submission payload mirrors `BooksCreateManualInputSchema` (#75) so the
 * server can accept it 1:1 once a tRPC client is wired in. Optional
 * fields are omitted (not set to `undefined`) when blank so the schema's
 * `.optional()` branches are exercised cleanly.
 */
export type ManualBookSubmission = BooksCreateManualInput;

export interface ManualBookFormProps {
  /**
   * Called when the viewer submits a valid form. Should call the eventual
   * `books.createManual` tRPC mutation. Errors thrown (e.g. server 400)
   * are caught and surfaced inline as a top-level error.
   */
  onSubmit: (submission: ManualBookSubmission) => Promise<void>;
  /** Initial title (useful for tests / SSR rehydration). */
  initialTitle?: string;
  /** Initial authors. At least one entry; blank entries are scrubbed at submit. */
  initialAuthors?: ReadonlyArray<string>;
  /** Initial ISBN (raw — hyphens / spaces tolerated). */
  initialIsbn?: string;
  /** Initial publication year. */
  initialYear?: string;
  /** Initial cover URL. */
  initialCoverUrl?: string;
}

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

const MAX_AUTHORS = 20;
const MAX_AUTHOR_LEN = 200;
const MAX_TITLE_LEN = 500;
const MAX_COVER_LEN = 2048;

/**
 * Validates a parsed year string against the server-side schema bounds
 * (`int >= 0, <= 9999`). Returns the parsed integer or an error message.
 */
function validateYear(raw: string): { value?: number; error?: string } {
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
function validateCoverUrl(raw: string): { value?: string; error?: string } {
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
function validateIsbn(raw: string): { value?: string; error?: string } {
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
 * server rejects. Exported so unit tests can exercise the validation
 * matrix without mounting the form.
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

/**
 * Manual book creation form (G-05, #79).
 *
 * Fields: title (required), authors (>=1 required), optional ISBN, year,
 * and cover URL. Validates client-side before calling `onSubmit`; the
 * server-side `books.createManual` (#75) is the source of truth and the
 * returned Edition has `source: "manual"`.
 *
 * The parent injects `onSubmit` so the page (RSC) can pass a server-action
 * shim today and switch to a tRPC client later without changing the form.
 */
export function ManualBookForm({
  onSubmit,
  initialTitle = "",
  initialAuthors = [""],
  initialIsbn = "",
  initialYear = "",
  initialCoverUrl = "",
}: ManualBookFormProps) {
  const [title, setTitle] = useState(initialTitle);
  const [authors, setAuthors] = useState<string[]>(
    initialAuthors.length > 0 ? [...initialAuthors] : [""],
  );
  const [isbn, setIsbn] = useState(initialIsbn);
  const [year, setYear] = useState(initialYear);
  const [coverUrl, setCoverUrl] = useState(initialCoverUrl);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const titleTrimmed = title.trim();
  const nonBlankAuthors = authors.map((a) => a.trim()).filter((a) => a !== "");
  const isFormFillable = titleTrimmed.length > 0 && nonBlankAuthors.length > 0;

  function setAuthorAt(index: number, value: string): void {
    setAuthors((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  function addAuthor(): void {
    if (authors.length >= MAX_AUTHORS) return;
    setAuthors((prev) => [...prev, ""]);
  }

  function removeAuthor(index: number): void {
    setAuthors((prev) => {
      if (prev.length <= 1) return [""];
      return prev.filter((_, i) => i !== index);
    });
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (submitting) return;
    setServerError(null);

    const result = validateManualBookState({
      title,
      authors,
      isbn,
      year,
      coverUrl,
    });
    setFieldErrors(result.errors);
    if (!result.ok || !result.payload) return;

    setSubmitting(true);
    try {
      await onSubmit(result.payload);
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : "Couldn't save the book. Please try again.";
      setServerError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      className="manualBookForm"
      onSubmit={handleSubmit}
      noValidate
      data-testid="manual-book-form"
      aria-labelledby="manual-book-form-title"
    >
      <h2 id="manual-book-form-title" className="manualBookFormTitle">
        Add a book manually
      </h2>
      <p className="manualBookFormHint">
        Use this if your book isn&rsquo;t in the catalog. Title and at least
        one author are required.
      </p>

      <div className="manualBookFormField">
        <label className="manualBookFormLabel" htmlFor="manual-book-title">
          Title<span aria-hidden="true"> *</span>
        </label>
        <input
          id="manual-book-title"
          className="manualBookFormInput"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={MAX_TITLE_LEN}
          aria-required="true"
          aria-invalid={fieldErrors.title ? "true" : undefined}
          aria-describedby={fieldErrors.title ? "manual-book-title-error" : undefined}
          disabled={submitting}
          data-testid="manual-book-title"
        />
        {fieldErrors.title ? (
          <p
            id="manual-book-title-error"
            className="manualBookFormError"
            role="alert"
            data-testid="manual-book-title-error"
          >
            {fieldErrors.title}
          </p>
        ) : null}
      </div>

      <fieldset
        className="manualBookFormField manualBookFormAuthors"
        aria-describedby={fieldErrors.authors ? "manual-book-authors-error" : undefined}
      >
        <legend className="manualBookFormLabel">
          Authors<span aria-hidden="true"> *</span>
        </legend>
        {authors.map((author, idx) => (
          <div key={idx} className="manualBookFormAuthorRow">
            <input
              className="manualBookFormInput"
              type="text"
              value={author}
              onChange={(e) => setAuthorAt(idx, e.target.value)}
              aria-label={`Author ${idx + 1}`}
              maxLength={MAX_AUTHOR_LEN}
              disabled={submitting}
              data-testid={`manual-book-author-${idx}`}
            />
            {authors.length > 1 ? (
              <button
                type="button"
                className="manualBookFormAuthorRemove"
                onClick={() => removeAuthor(idx)}
                aria-label={`Remove author ${idx + 1}`}
                disabled={submitting}
                data-testid={`manual-book-author-remove-${idx}`}
              >
                ×
              </button>
            ) : null}
          </div>
        ))}
        <button
          type="button"
          className="manualBookFormAuthorAdd"
          onClick={addAuthor}
          disabled={submitting || authors.length >= MAX_AUTHORS}
          data-testid="manual-book-author-add"
        >
          + Add author
        </button>
        {fieldErrors.authors ? (
          <p
            id="manual-book-authors-error"
            className="manualBookFormError"
            role="alert"
            data-testid="manual-book-authors-error"
          >
            {fieldErrors.authors}
          </p>
        ) : null}
      </fieldset>

      <div className="manualBookFormField">
        <label className="manualBookFormLabel" htmlFor="manual-book-isbn">
          ISBN <span className="manualBookFormOptional">(optional)</span>
        </label>
        <input
          id="manual-book-isbn"
          className="manualBookFormInput"
          type="text"
          value={isbn}
          onChange={(e) => setIsbn(e.target.value)}
          inputMode="numeric"
          autoComplete="off"
          aria-invalid={fieldErrors.isbn ? "true" : undefined}
          aria-describedby={fieldErrors.isbn ? "manual-book-isbn-error" : undefined}
          disabled={submitting}
          data-testid="manual-book-isbn"
        />
        {fieldErrors.isbn ? (
          <p
            id="manual-book-isbn-error"
            className="manualBookFormError"
            role="alert"
            data-testid="manual-book-isbn-error"
          >
            {fieldErrors.isbn}
          </p>
        ) : null}
      </div>

      <div className="manualBookFormField">
        <label className="manualBookFormLabel" htmlFor="manual-book-year">
          Publication year{" "}
          <span className="manualBookFormOptional">(optional)</span>
        </label>
        <input
          id="manual-book-year"
          className="manualBookFormInput"
          type="number"
          inputMode="numeric"
          min={0}
          max={9999}
          step={1}
          value={year}
          onChange={(e) => setYear(e.target.value)}
          aria-invalid={fieldErrors.year ? "true" : undefined}
          aria-describedby={fieldErrors.year ? "manual-book-year-error" : undefined}
          disabled={submitting}
          data-testid="manual-book-year"
        />
        {fieldErrors.year ? (
          <p
            id="manual-book-year-error"
            className="manualBookFormError"
            role="alert"
            data-testid="manual-book-year-error"
          >
            {fieldErrors.year}
          </p>
        ) : null}
      </div>

      <div className="manualBookFormField">
        <label className="manualBookFormLabel" htmlFor="manual-book-cover">
          Cover URL <span className="manualBookFormOptional">(optional)</span>
        </label>
        <input
          id="manual-book-cover"
          className="manualBookFormInput"
          type="url"
          value={coverUrl}
          onChange={(e) => setCoverUrl(e.target.value)}
          autoComplete="off"
          placeholder="https://"
          aria-invalid={fieldErrors.coverUrl ? "true" : undefined}
          aria-describedby={fieldErrors.coverUrl ? "manual-book-cover-error" : undefined}
          disabled={submitting}
          data-testid="manual-book-cover"
        />
        {fieldErrors.coverUrl ? (
          <p
            id="manual-book-cover-error"
            className="manualBookFormError"
            role="alert"
            data-testid="manual-book-cover-error"
          >
            {fieldErrors.coverUrl}
          </p>
        ) : null}
      </div>

      {serverError ? (
        <p
          className="manualBookFormError manualBookFormServerError"
          role="alert"
          data-testid="manual-book-server-error"
        >
          {serverError}
        </p>
      ) : null}

      <div className="manualBookFormActions">
        <button
          type="submit"
          className="manualBookFormSubmit"
          disabled={submitting || !isFormFillable}
          data-testid="manual-book-submit"
        >
          {submitting ? "Saving…" : "Add book"}
        </button>
      </div>
    </form>
  );
}

// Exported for tests so the validation helpers can be checked in isolation
// without rendering the form.
export const __testing = { validateIsbn, validateYear, validateCoverUrl };
