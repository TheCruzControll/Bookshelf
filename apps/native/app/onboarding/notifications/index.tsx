import { StepShell } from "../StepShell";
import { NotificationsSoftPrompt } from "../NotificationsSoftPrompt";

export default function NotificationsStepScreen() {
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
