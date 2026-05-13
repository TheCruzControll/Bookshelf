import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { firstIncompleteStep } from "./steps";
import type { OnboardingState } from "./steps";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Welcome to Hone",
};

/**
 * Fetch the viewer's onboarding completion state. Server-side hook
 * point — the parent injects identity from cookies/session and the
 * function consults the API. Returns null when no viewer is present
 * so the index page falls back to a generic welcome.
 */
async function fetchOnboardingState(): Promise<OnboardingState | null> {
  return null;
}

export default async function OnboardingIndexPage() {
  const state = await fetchOnboardingState();

  if (state) {
    const next = firstIncompleteStep(state);
    if (next) {
      redirect(`/onboarding/${next}`);
    } else {
      redirect("/");
    }
  }

  return (
    <main className="shell">
      <h1>Welcome to Hone</h1>
      <p>Let&apos;s get your taste profile set up.</p>
    </main>
  );
}
