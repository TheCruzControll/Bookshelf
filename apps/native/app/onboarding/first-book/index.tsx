import { Text } from "react-native";
import { StepShell } from "../StepShell";

export default function FirstBookStepScreen() {
  return (
    <StepShell
      step="first-book"
      title="Add your first book"
      description="Search a title or scan an ISBN to start ranking what you've read."
    >
      <Text>We&apos;ll use your first ranking to start calibrating your taste.</Text>
    </StepShell>
  );
}
