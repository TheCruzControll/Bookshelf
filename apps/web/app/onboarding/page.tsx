import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function OnboardingPage() {
  return (
    <main className="shell">
      <h1>Welcome to Hone</h1>
    </main>
  );
}
