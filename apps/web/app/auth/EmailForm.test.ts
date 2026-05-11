import { describe, it, expect, vi } from "vitest";
import type { EmailFormProps } from "./EmailForm";

describe("EmailForm component contract", () => {
  it("accepts the required onSubmit prop", () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const props: EmailFormProps = { onSubmit };
    expect(props.onSubmit).toBe(onSubmit);
  });

  it("accepts optional disabled prop", () => {
    const props: EmailFormProps = {
      onSubmit: vi.fn().mockResolvedValue(undefined),
      disabled: true,
    };
    expect(props.disabled).toBe(true);
  });

  it("accepts optional submitLabel", () => {
    const props: EmailFormProps = {
      onSubmit: vi.fn().mockResolvedValue(undefined),
      submitLabel: "Get link",
    };
    expect(props.submitLabel).toBe("Get link");
  });

  it("onSubmit receives email string", async () => {
    const calls: string[] = [];
    const props: EmailFormProps = {
      onSubmit: async (email) => {
        calls.push(email);
      },
    };
    await props.onSubmit("test@example.com");
    expect(calls).toEqual(["test@example.com"]);
  });

  it("onSubmit propagates errors", async () => {
    const props: EmailFormProps = {
      onSubmit: async () => {
        throw new Error("rate limited");
      },
    };
    await expect(props.onSubmit("test@example.com")).rejects.toThrow(
      "rate limited"
    );
  });
});
