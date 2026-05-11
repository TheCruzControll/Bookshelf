"use client";

import { useState } from "react";

export interface EmailFormProps {
  onSubmit: (email: string) => Promise<void>;
  disabled?: boolean;
  submitLabel?: string;
}

export function EmailForm({
  onSubmit,
  disabled,
  submitLabel = "Send magic link",
}: EmailFormProps) {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(trimmed);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Something went wrong. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  const isDisabled = disabled || submitting;

  return (
    <form className="authEmailForm" onSubmit={handleSubmit}>
      <input
        className="authEmailInput"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        aria-label="Email address"
        disabled={isDisabled}
        required
        autoComplete="email"
      />
      {error ? (
        <p className="authError" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        className="authSubmitButton"
        disabled={!email.trim() || isDisabled}
        aria-label={submitLabel}
      >
        {submitting ? "Sending..." : submitLabel}
      </button>
    </form>
  );
}
