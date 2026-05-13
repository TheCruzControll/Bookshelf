import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { ONBOARDING_STEPS, isRequired, nextStep } from "./steps";
import type { OnboardingStep } from "./steps";

export interface StepShellProps {
  step: OnboardingStep;
  title: string;
  description?: string;
  children?: ReactNode;
}

/**
 * Shared chrome for every onboarding step (#65, E-10).
 *
 * Mirrors apps/web/app/onboarding/StepShell.tsx — same required/optional
 * gating: required steps render Continue only, optional steps render
 * Continue + a one-tap Skip that advances to the next step without
 * persisting state.
 */
export function StepShell({ step, title, description, children }: StepShellProps) {
  const router = useRouter();
  const next = nextStep(step);
  const required = isRequired(step);
  const stepNumber = ONBOARDING_STEPS.indexOf(step) + 1;
  const total = ONBOARDING_STEPS.length;

  const continueHref = next ? `/onboarding/${next}` : "/";
  const continueLabel = next ? "Continue" : "Finish";

  return (
    <View style={styles.screen} accessibilityLabel={`Onboarding step ${stepNumber} of ${total}`}>
      <Text style={styles.progress}>
        Step {stepNumber} of {total}
      </Text>
      <Text style={styles.heading} accessibilityRole="header">
        {title}
      </Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
      {children}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.continueButton}
          onPress={() => router.push(continueHref)}
          accessibilityRole="button"
          accessibilityLabel={`${continueLabel} to ${next ?? "home"}`}
        >
          <Text style={styles.continueLabel}>{continueLabel}</Text>
        </TouchableOpacity>
        {!required && next ? (
          <TouchableOpacity
            onPress={() => router.push(`/onboarding/${next}`)}
            accessibilityRole="button"
            accessibilityLabel="Skip this step"
          >
            <Text style={styles.skipLabel}>Skip</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: "#F7F2EA", flex: 1, gap: 14, padding: 24, paddingTop: 40 },
  progress: { color: "#676158", fontSize: 12 },
  heading: { color: "#181512", fontSize: 24, fontWeight: "700" },
  description: { color: "#676158", fontSize: 14, lineHeight: 20 },
  actions: { alignItems: "center", flexDirection: "row", gap: 16, marginTop: 12 },
  continueButton: {
    alignItems: "center",
    backgroundColor: "#253F5B",
    borderRadius: 6,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  continueLabel: { color: "#F7F4ED", fontSize: 15, fontWeight: "600" },
  skipLabel: { color: "#676158", fontSize: 14, fontWeight: "600" },
});
