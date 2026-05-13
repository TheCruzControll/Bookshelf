import { Text } from "react-native";
import { StepShell } from "../StepShell";

export default function PhoneStepScreen() {
  return (
    <StepShell
      step="phone"
      title="Verify your phone"
      description="We use your number to help friends find you and to secure your account."
    >
      <Text>Phone verification is required to continue.</Text>
    </StepShell>
  );
}
