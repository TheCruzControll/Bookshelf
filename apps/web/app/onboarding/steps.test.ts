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

describe("ONBOARDING_STEPS", () => {
  it("matches the order defined in the issue", () => {
    expect(ONBOARDING_STEPS).toEqual([
      "phone",
      "handle",
      "first-book",
      "contacts",
      "follow",
      "notifications",
    ]);
  });

  it("contains exactly six steps", () => {
    expect(ONBOARDING_STEPS).toHaveLength(6);
  });
});

describe("isRequired", () => {
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

  it("REQUIRED_STEPS contains exactly phone, handle, first-book", () => {
    expect(new Set(REQUIRED_STEPS)).toEqual(new Set(["phone", "handle", "first-book"]));
  });
});

describe("nextStep / previousStep", () => {
  it("walks the graph forwards", () => {
    expect(nextStep("phone")).toBe("handle");
    expect(nextStep("handle")).toBe("first-book");
    expect(nextStep("first-book")).toBe("contacts");
    expect(nextStep("contacts")).toBe("follow");
    expect(nextStep("follow")).toBe("notifications");
  });

  it("returns null past the end / before the start", () => {
    expect(nextStep("notifications")).toBeNull();
    expect(previousStep("phone")).toBeNull();
  });

  it("walks the graph backwards", () => {
    expect(previousStep("handle")).toBe("phone");
    expect(previousStep("notifications")).toBe("follow");
  });
});

describe("firstIncompleteStep", () => {
  it("returns the first required-incomplete step", () => {
    expect(
      firstIncompleteStep({ phoneVerified: false, hasHandle: false, hasFinishedBook: false }),
    ).toBe("phone");
    expect(
      firstIncompleteStep({ phoneVerified: true, hasHandle: false, hasFinishedBook: false }),
    ).toBe("handle");
    expect(
      firstIncompleteStep({ phoneVerified: true, hasHandle: true, hasFinishedBook: false }),
    ).toBe("first-book");
  });

  it("returns null when all required steps are done and optional state is unspecified", () => {
    expect(
      firstIncompleteStep({ phoneVerified: true, hasHandle: true, hasFinishedBook: true }),
    ).toBeNull();
  });

  it("resumes optional flow when contactsSynced is explicitly false", () => {
    expect(
      firstIncompleteStep({
        phoneVerified: true,
        hasHandle: true,
        hasFinishedBook: true,
        contactsSynced: false,
      }),
    ).toBe("contacts");
  });

  it("resumes follow step when hasFollow is explicitly false and earlier optional steps are done", () => {
    expect(
      firstIncompleteStep({
        phoneVerified: true,
        hasHandle: true,
        hasFinishedBook: true,
        contactsSynced: true,
        hasFollow: false,
      }),
    ).toBe("follow");
  });

  it("resumes notifications step when notificationsPromptShown is explicitly false", () => {
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
