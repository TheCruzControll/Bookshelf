import type { Metadata } from "next";
import { StepShell } from "../StepShell";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Find friends — Hone",
};

export default function ContactsStepPage() {
  return (
    <StepShell
      step="contacts"
      title="Find friends from your contacts"
      description="We'll match phone numbers privately on-device using one-way hashes. You can skip this for now."
    >
      <p className="onboardingHint">
        Contacts sync is optional. You can enable it anytime in Settings.
      </p>
    </StepShell>
  );
}
