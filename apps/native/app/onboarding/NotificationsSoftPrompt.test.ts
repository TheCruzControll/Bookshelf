import { describe, it, expect } from "vitest";
import type {
  IosPermissionStatus,
  NotificationsSoftPromptProps,
} from "./NotificationsSoftPrompt";

describe("NotificationsSoftPrompt (native) contract", () => {
  it("requestOsPermission is optional", () => {
    const props: NotificationsSoftPromptProps = {};
    expect(props.requestOsPermission).toBeUndefined();
  });

  it("accepts an async permission requester", async () => {
    const props: NotificationsSoftPromptProps = {
      requestOsPermission: async (): Promise<IosPermissionStatus> => "granted",
    };
    expect(await props.requestOsPermission!()).toBe("granted");
  });

  it("accepts a synchronous permission requester", async () => {
    const props: NotificationsSoftPromptProps = {
      requestOsPermission: (): IosPermissionStatus => "denied",
    };
    expect(await Promise.resolve(props.requestOsPermission!())).toBe("denied");
  });
});
