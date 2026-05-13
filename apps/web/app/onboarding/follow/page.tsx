import type { Metadata } from "next";
import { StepShell } from "../StepShell";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Follow a reader — Hone",
};

export default function FollowStepPage() {
  return (
    <StepShell
      step="follow"
      title="Follow a few readers"
      description="People you follow shape your recommendations. You can skip this for now."
    >
      <p className="onboardingHint">
        Following is optional and can be done anytime from a profile.
      </p>
    </StepShell>
  );
}
