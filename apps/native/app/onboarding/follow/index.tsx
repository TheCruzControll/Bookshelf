import { Text } from "react-native";
import { StepShell } from "../StepShell";

export default function FollowStepScreen() {
  return (
    <StepShell
      step="follow"
      title="Follow a few readers"
      description="People you follow shape your recommendations. You can skip this for now."
    >
      <Text>Following is optional and can be done anytime from a profile.</Text>
    </StepShell>
  );
}
