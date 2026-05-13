import { describe, it, expect } from "vitest";
import type { NotificationsSoftPromptProps } from "./NotificationsSoftPrompt";

describe("NotificationsSoftPrompt contract", () => {
  it("requestOsPermission is optional and defaults to Notification.requestPermission", () => {
    const props: NotificationsSoftPromptProps = {};
    expect(props.requestOsPermission).toBeUndefined();
  });

  it("accepts an explicit async permission requester", async () => {
    const calls: number[] = [];
    const props: NotificationsSoftPromptProps = {
      requestOsPermission: async (): Promise<NotificationPermission> => {
        calls.push(1);
        return "granted";
      },
    };
    const result = await props.requestOsPermission!();
    expect(result).toBe("granted");
    expect(calls).toEqual([1]);
  });

  it("accepts a synchronous permission requester", async () => {
    const props: NotificationsSoftPromptProps = {
      requestOsPermission: (): NotificationPermission => "denied",
    };
    const result = await Promise.resolve(props.requestOsPermission!());
    expect(result).toBe("denied");
  });
});
