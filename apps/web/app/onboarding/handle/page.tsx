import type { Metadata } from "next";
import { StepShell } from "../StepShell";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Pick your handle — Hone",
};

export default function HandleStepPage() {
  return (
    <StepShell
      step="handle"
      title="Pick your handle"
      description="This is how friends will find your profile on Hone."
    >
      <p className="onboardingHint">
        Letters, numbers, and dashes. You can change this once a year.
      </p>
    </StepShell>
  );
}
