"use client";

import { useState } from "react";
import { OAuthButtons } from "../auth/OAuthButtons";
import { EmailForm } from "../auth/EmailForm";
import { appleSignIn, googleSignIn, requestMagicLink } from "../auth/auth-api";
import { persistSession } from "../auth/session";

type AuthStep = "idle" | "loading" | "magic-link-sent" | "error";

export default function SignInPage() {
  const [step, setStep] = useState<AuthStep>("idle");
  const [error, setError] = useState<string | null>(null);

  function handleAuthResult(result: { sessionToken: string; isNewUser: boolean }) {
    persistSession(result.sessionToken);
    if (result.isNewUser) {
      window.location.href = "/onboarding";
    } else {
      window.location.href = "/";
    }
  }

  async function handleApple() {
    setStep("loading");
    setError(null);
    try {
      // In a real implementation the Apple JS SDK presents the
      // native sign-in dialog and returns an identityToken + nonce.
      // Here we call the API with a placeholder that the native
      // Apple Sign In JS SDK would populate.
      const result = await appleSignIn("APPLE_IDENTITY_TOKEN");
      handleAuthResult(result);
    } catch (err: unknown) {
      setStep("error");
      setError(err instanceof Error ? err.message : "Apple sign-in failed");
    }
  }

  async function handleGoogle() {
    setStep("loading");
    setError(null);
    try {
      // In a real implementation the Google Identity Services SDK
      // provides the id_token via the credential response callback.
      const result = await googleSignIn("GOOGLE_ID_TOKEN");
      handleAuthResult(result);
    } catch (err: unknown) {
      setStep("error");
      setError(err instanceof Error ? err.message : "Google sign-in failed");
    }
  }

  async function handleEmailSubmit(email: string) {
    setStep("loading");
    setError(null);
    try {
      await requestMagicLink(email);
      setStep("magic-link-sent");
    } catch (err: unknown) {
      setStep("error");
      setError(err instanceof Error ? err.message : "Failed to send magic link");
    }
  }

  const isLoading = step === "loading";

  return (
    <main className="authShell">
      <div className="authCard">
        <p className="brandMark" aria-label="Hone">
          本 <span>Hone</span>
        </p>
        <h1 className="authHeading">Sign in</h1>

        {step === "magic-link-sent" ? (
          <div className="authMagicLinkSent" role="status">
            <p>Check your email for a sign-in link.</p>
            <button
              type="button"
              className="authBackButton"
              onClick={() => setStep("idle")}
            >
              Back
            </button>
          </div>
        ) : (
          <>
            <OAuthButtons
              onApple={handleApple}
              onGoogle={handleGoogle}
              disabled={isLoading}
            />
            <div className="authDivider" aria-hidden="true">
              <span>or</span>
            </div>
            <EmailForm
              onSubmit={handleEmailSubmit}
              disabled={isLoading}
              submitLabel="Send magic link"
            />
          </>
        )}

        {error ? (
          <p className="authError" role="alert">
            {error}
          </p>
        ) : null}

        <p className="authSwitch">
          Don&apos;t have an account?{" "}
          <a href="/sign-up">Sign up</a>
        </p>
      </div>
    </main>
  );
}
