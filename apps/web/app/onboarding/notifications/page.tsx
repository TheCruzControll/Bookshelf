import type { Metadata } from "next";
import { StepShell } from "../StepShell";
import { NotificationsSoftPrompt } from "../NotificationsSoftPrompt";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Notifications — Hone",
};

export default function NotificationsStepPage() {
  return (
    <StepShell
      step="notifications"
      title="Stay in the loop"
      description="Push notifications fire only for the moments that matter — new followers, mutuals finishing a book, security alerts."
    >
      <NotificationsSoftPrompt />
    </StepShell>
  );
}
