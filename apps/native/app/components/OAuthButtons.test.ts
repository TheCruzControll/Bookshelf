import { describe, it, expect } from "vitest";
import type { OAuthButtonsProps } from "./OAuthButtons";

describe("OAuthButtons (native) contract", () => {
  it("requires onProvider", () => {
    const props: OAuthButtonsProps = {
      onProvider: async () => {},
    };
    expect(typeof props.onProvider).toBe("function");
  });

  it("onProvider receives only 'apple' or 'google'", async () => {
    const seen: Array<"apple" | "google"> = [];
    const props: OAuthButtonsProps = {
      onProvider: async (p) => {
        seen.push(p);
      },
    };
    await props.onProvider("apple");
    await props.onProvider("google");
    expect(seen).toEqual(["apple", "google"]);
  });

  it("accepts an optional onMagicLinkEmail handler", () => {
    const props: OAuthButtonsProps = {
      onProvider: async () => {},
      onMagicLinkEmail: async () => {},
    };
    expect(typeof props.onMagicLinkEmail).toBe("function");
  });

  it("accepts disabled flag", () => {
    const props: OAuthButtonsProps = {
      onProvider: async () => {},
      disabled: true,
    };
    expect(props.disabled).toBe(true);
  });
});
