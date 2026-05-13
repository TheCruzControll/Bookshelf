import { describe, it, expect } from "vitest";
import {
  ONBOARDING_STEPS,
  REQUIRED_STEPS,
  firstIncompleteStep,
  isRequired,
  nextStep,
  previousStep,
} from "./steps";
import type { OnboardingStep } from "./steps";

describe("ONBOARDING_STEPS (native)", () => {
  it("matches the spec order and length", () => {
    expect(ONBOARDING_STEPS).toEqual([
      "phone",
      "handle",
      "first-book",
      "contacts",
      "follow",
      "notifications",
    ]);
  });
});

describe("isRequired (native)", () => {
  it.each<[OnboardingStep, boolean]>([
    ["phone", true],
    ["handle", true],
    ["first-book", true],
    ["contacts", false],
    ["follow", false],
    ["notifications", false],
  ])("%s is required=%s", (step, required) => {
    expect(isRequired(step)).toBe(required);
  });

  it("REQUIRED_STEPS contains exactly the three required steps", () => {
    expect(new Set(REQUIRED_STEPS)).toEqual(new Set(["phone", "handle", "first-book"]));
  });
});

describe("nextStep / previousStep (native)", () => {
  it("walks the graph", () => {
    expect(nextStep("phone")).toBe("handle");
    expect(nextStep("notifications")).toBeNull();
    expect(previousStep("phone")).toBeNull();
    expect(previousStep("notifications")).toBe("follow");
  });
});

describe("firstIncompleteStep (native)", () => {
  it("returns the first incomplete required step", () => {
    expect(firstIncompleteStep({ phoneVerified: false, hasHandle: false, hasFinishedBook: false })).toBe("phone");
    expect(firstIncompleteStep({ phoneVerified: true, hasHandle: false, hasFinishedBook: false })).toBe("handle");
    expect(firstIncompleteStep({ phoneVerified: true, hasHandle: true, hasFinishedBook: false })).toBe("first-book");
  });

  it("returns null when all required steps are done and optional state unspecified", () => {
    expect(firstIncompleteStep({ phoneVerified: true, hasHandle: true, hasFinishedBook: true })).toBeNull();
  });

  it("resumes contacts/follow/notifications when explicitly false", () => {
    expect(
      firstIncompleteStep({
        phoneVerified: true,
        hasHandle: true,
        hasFinishedBook: true,
        contactsSynced: false,
      }),
    ).toBe("contacts");
    expect(
      firstIncompleteStep({
        phoneVerified: true,
        hasHandle: true,
        hasFinishedBook: true,
        contactsSynced: true,
        hasFollow: false,
      }),
    ).toBe("follow");
    expect(
      firstIncompleteStep({
        phoneVerified: true,
        hasHandle: true,
        hasFinishedBook: true,
        contactsSynced: true,
        hasFollow: true,
        notificationsPromptShown: false,
      }),
    ).toBe("notifications");
  });
});
