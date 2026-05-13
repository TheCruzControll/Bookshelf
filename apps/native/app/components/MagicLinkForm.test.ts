import { describe, it, expect } from "vitest";
import type { MagicLinkFormProps } from "./MagicLinkForm";

describe("MagicLinkForm (native) contract", () => {
  it("requires onSubmit", () => {
    const props: MagicLinkFormProps = {
      onSubmit: async () => {},
    };
    expect(typeof props.onSubmit).toBe("function");
  });

  it("onSubmit receives the trimmed email", async () => {
    const seen: string[] = [];
    const props: MagicLinkFormProps = {
      onSubmit: async (email) => {
        seen.push(email);
      },
    };
    await props.onSubmit("user@example.com");
    expect(seen).toEqual(["user@example.com"]);
  });

  it("accepts initialEmail", () => {
    const props: MagicLinkFormProps = {
      onSubmit: async () => {},
      initialEmail: "user@example.com",
    };
    expect(props.initialEmail).toBe("user@example.com");
  });
});
