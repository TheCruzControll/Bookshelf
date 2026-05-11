"use client";

import { useEffect, useState } from "react";
import { consumeMagicLink } from "../auth-api";
import { persistSession } from "../session";

export default function AuthCallbackPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (!token) {
      setError("Missing token. Please request a new magic link.");
      return;
    }

    let cancelled = false;

    async function redeem() {
      try {
        const result = await consumeMagicLink(token!);
        if (cancelled) return;
        persistSession(result.sessionToken);
        if (result.isNewUser) {
          window.location.href = "/onboarding";
        } else {
          window.location.href = "/";
        }
      } catch (err: unknown) {
        if (cancelled) return;
        setError(
          err instanceof Error
            ? err.message
            : "Failed to verify magic link. It may have expired."
        );
      }
    }

    void redeem();

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <main className="authShell">
        <div className="authCard">
          <h1 className="authHeading">Sign-in failed</h1>
          <p className="authError" role="alert">
            {error}
          </p>
          <a href="/sign-in" className="authBackButton">
            Back to sign in
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="authShell">
      <div className="authCard">
        <h1 className="authHeading">Signing you in...</h1>
        <p className="authLoadingText">Verifying your magic link.</p>
      </div>
    </main>
  );
}
