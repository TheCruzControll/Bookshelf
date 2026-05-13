/**
 * Onboarding step graph (#65 [E-10]).
 *
 * Mirrors apps/web/app/onboarding/steps.ts. Step order, required vs.
 * optional designation, and `firstIncompleteStep` semantics are kept
 * identical so the two surfaces stay in sync.
 */

export type OnboardingStep =
  | "phone"
  | "handle"
  | "first-book"
  | "contacts"
  | "follow"
  | "notifications";

export const ONBOARDING_STEPS: ReadonlyArray<OnboardingStep> = [
  "phone",
  "handle",
  "first-book",
  "contacts",
  "follow",
  "notifications",
] as const;

export const REQUIRED_STEPS: ReadonlySet<OnboardingStep> = new Set([
  "phone",
  "handle",
  "first-book",
]);

export function isRequired(step: OnboardingStep): boolean {
  return REQUIRED_STEPS.has(step);
}

export function nextStep(step: OnboardingStep): OnboardingStep | null {
  const idx = ONBOARDING_STEPS.indexOf(step);
  if (idx < 0 || idx === ONBOARDING_STEPS.length - 1) return null;
  return ONBOARDING_STEPS[idx + 1]!;
}

export function previousStep(step: OnboardingStep): OnboardingStep | null {
  const idx = ONBOARDING_STEPS.indexOf(step);
  if (idx <= 0) return null;
  return ONBOARDING_STEPS[idx - 1]!;
}

export interface OnboardingState {
  phoneVerified: boolean;
  hasHandle: boolean;
  hasFinishedBook: boolean;
  contactsSynced?: boolean;
  hasFollow?: boolean;
  notificationsPromptShown?: boolean;
}

export function firstIncompleteStep(state: OnboardingState): OnboardingStep | null {
  if (!state.phoneVerified) return "phone";
  if (!state.hasHandle) return "handle";
  if (!state.hasFinishedBook) return "first-book";
  if (state.contactsSynced === false) return "contacts";
  if (state.hasFollow === false) return "follow";
  if (state.notificationsPromptShown === false) return "notifications";
  return null;
}
