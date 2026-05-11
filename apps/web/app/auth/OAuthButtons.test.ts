import { describe, it, expect, vi } from "vitest";
import type { OAuthButtonsProps } from "./OAuthButtons";

describe("OAuthButtons component contract", () => {
  it("accepts onApple and onGoogle callbacks", () => {
    const onApple = vi.fn();
    const onGoogle = vi.fn();
    const props: OAuthButtonsProps = { onApple, onGoogle };
    expect(props.onApple).toBe(onApple);
    expect(props.onGoogle).toBe(onGoogle);
  });

  it("accepts optional disabled prop", () => {
    const props: OAuthButtonsProps = {
      onApple: vi.fn(),
      onGoogle: vi.fn(),
      disabled: true,
    };
    expect(props.disabled).toBe(true);
  });

  it("disabled defaults to undefined when omitted", () => {
    const props: OAuthButtonsProps = {
      onApple: vi.fn(),
      onGoogle: vi.fn(),
    };
    expect(props.disabled).toBeUndefined();
  });

  it("onApple can be invoked", () => {
    const onApple = vi.fn();
    const props: OAuthButtonsProps = {
      onApple,
      onGoogle: vi.fn(),
    };
    props.onApple();
    expect(onApple).toHaveBeenCalledTimes(1);
  });

  it("onGoogle can be invoked", () => {
    const onGoogle = vi.fn();
    const props: OAuthButtonsProps = {
      onApple: vi.fn(),
      onGoogle,
    };
    props.onGoogle();
    expect(onGoogle).toHaveBeenCalledTimes(1);
  });
});
