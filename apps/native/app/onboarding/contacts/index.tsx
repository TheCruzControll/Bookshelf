import { Text } from "react-native";
import { StepShell } from "../StepShell";

export default function ContactsStepScreen() {
  return (
    <StepShell
      step="contacts"
      title="Find friends from your contacts"
      description="We'll match phone numbers privately on-device using one-way hashes. You can skip this for now."
    >
      <Text>Contacts sync is optional. You can enable it anytime in Settings.</Text>
    </StepShell>
  );
}
