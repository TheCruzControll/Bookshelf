import { Text } from "react-native";
import { StepShell } from "../StepShell";

export default function HandleStepScreen() {
  return (
    <StepShell
      step="handle"
      title="Pick your handle"
      description="This is how friends will find your profile on Hone."
    >
      <Text>Letters, numbers, and dashes. You can change this once a year.</Text>
    </StepShell>
  );
}
