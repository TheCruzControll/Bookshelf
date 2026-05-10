"use client";

import { useState } from "react";
import type { EntityId, Visibility } from "@hone/domain";

const VISIBILITY_OPTIONS: { value: Visibility; label: string }[] = [
  { value: "public", label: "Public" },
  { value: "followers", label: "Followers" },
  { value: "mutuals", label: "Mutuals" },
  { value: "private", label: "Private" },
];

export interface ReviewComposeProps {
  bookId: EntityId;
  editionId?: EntityId;
  initialBody?: string;
  initialVisibility?: Visibility;
  onSubmit: (args: { body: string; visibility: Visibility }) => Promise<void>;
}

export function ReviewCompose({
  bookId: _bookId,
  editionId: _editionId,
  initialBody = "",
  initialVisibility = "public",
  onSubmit,
}: ReviewComposeProps) {
  const [body, setBody] = useState(initialBody);
  const [visibility, setVisibility] = useState<Visibility>(initialVisibility);
  const [submitting, setSubmitting] = useState(false);
  const [conflictError, setConflictError] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() || submitting) return;
    setSubmitting(true);
    setConflictError(false);
    setError(null);
    try {
      await onSubmit({ body: body.trim(), visibility });
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        (err.message.includes("409") || err.message.toLowerCase().includes("conflict"))
      ) {
        setConflictError(true);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="reviewCompose" onSubmit={handleSubmit}>
      <textarea
        className="reviewComposeBody"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write your review…"
        aria-label="Review body"
        disabled={submitting}
        rows={6}
      />
      <div className="reviewComposeVisibilityRow" role="group" aria-label="Visibility">
        {VISIBILITY_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={
              "reviewComposeVisibilityButton" +
              (visibility === opt.value ? " reviewComposeVisibilityButtonActive" : "")
            }
            onClick={() => setVisibility(opt.value)}
            aria-pressed={visibility === opt.value}
            aria-label={opt.label}
            disabled={submitting}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {conflictError ? (
        <p className="reviewComposeConflictError" role="alert">
          This review was updated elsewhere. Please reload and try again.
        </p>
      ) : null}
      {error ? (
        <p className="reviewComposeError" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        className="reviewComposeSubmit"
        disabled={!body.trim() || submitting}
        aria-label="Submit review"
      >
        {submitting ? "Submitting…" : "Submit"}
      </button>
    </form>
  );
}
