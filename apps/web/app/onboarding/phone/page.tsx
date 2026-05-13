import type { Metadata } from "next";
import { StepShell } from "../StepShell";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Verify your phone — Hone",
};

export default function PhoneStepPage() {
  return (
    <StepShell
      step="phone"
      title="Verify your phone"
      description="We use your number to help friends find you and to secure your account."
    >
      <p className="onboardingHint">
        Phone verification is required to continue.
      </p>
    </StepShell>
  );
}
