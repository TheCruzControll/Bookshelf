/**
 * Onboarding step graph (#63 [E-08]).
 *
 * The six steps run in fixed order; required steps gate the home feed
 * and cannot be skipped, optional steps render a one-tap "Skip" affordance
 * that advances to the next step without persisting state.
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

/**
 * Determine the first onboarding step that is still incomplete given a
 * snapshot of viewer state. Returns null when onboarding is fully done
 * (so callers can land the home feed).
 */
export interface OnboardingState {
  phoneVerified: boolean;
  hasHandle: boolean;
  hasFinishedBook: boolean;
  /** Optional steps don't gate the feed; their completion controls whether the dispatcher should resume mid-flow. */
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
