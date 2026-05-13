import Link from "next/link";
import type { ReactNode } from "react";
import {
  ONBOARDING_STEPS,
  isRequired,
  nextStep,
} from "./steps";
import type { OnboardingStep } from "./steps";

export interface StepShellProps {
  step: OnboardingStep;
  title: string;
  description?: string;
  children?: ReactNode;
}

/**
 * Shared chrome for every onboarding step. Renders the step heading and
 * either a "Continue" or "Continue / Skip" pair depending on whether the
 * step is required. Optional steps surface a single-tap Skip link that
 * advances to the next step without persisting any state.
 */
export function StepShell({ step, title, description, children }: StepShellProps) {
  const next = nextStep(step);
  const required = isRequired(step);
  const stepNumber = ONBOARDING_STEPS.indexOf(step) + 1;
  const total = ONBOARDING_STEPS.length;

  return (
    <main className="shell onboardingShell" aria-labelledby="onboardingHeading">
      <p className="onboardingProgress">
        Step {stepNumber} of {total}
      </p>
      <h1 id="onboardingHeading">{title}</h1>
      {description ? <p className="onboardingDescription">{description}</p> : null}
      {children}
      <div className="onboardingActions">
        {next ? (
          <Link
            href={`/onboarding/${next}`}
            className="onboardingContinue"
            aria-label={`Continue to ${next}`}
          >
            Continue
          </Link>
        ) : (
          <Link href="/" className="onboardingContinue" aria-label="Finish onboarding">
            Finish
          </Link>
        )}
        {!required && next ? (
          <Link
            href={`/onboarding/${next}`}
            className="onboardingSkip"
            aria-label="Skip this step"
            data-testid="onboarding-skip"
          >
            Skip
          </Link>
        ) : null}
      </div>
    </main>
  );
}
