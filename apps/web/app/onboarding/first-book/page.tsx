import type { Metadata } from "next";
import { StepShell } from "../StepShell";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Add your first book — Hone",
};

export default function FirstBookStepPage() {
  return (
    <StepShell
      step="first-book"
      title="Add your first book"
      description="Search a title or scan an ISBN to start ranking what you've read."
    >
      <p className="onboardingHint">
        We'll use your first ranking to start calibrating your taste.
      </p>
    </StepShell>
  );
}
