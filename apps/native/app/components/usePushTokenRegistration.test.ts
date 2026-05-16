import { describe, it, expect, vi } from "vitest";
import type {
  PushPermissionStatus,
  PushRegistrationState,
  PushTokenRegistrationDeps,
  UsePushTokenRegistrationResult,
} from "./usePushTokenRegistration";
import type { NotificationPlatformInput } from "@hone/domain";

describe("usePushTokenRegistration (native) contract", () => {
  it("PushPermissionStatus enumerates granted/denied/undetermined", () => {
    const granted: PushPermissionStatus = "granted";
    const denied: PushPermissionStatus = "denied";
    const undetermined: PushPermissionStatus = "undetermined";
    expect([granted, denied, undetermined]).toEqual(["granted", "denied", "undetermined"]);
  });

  it("PushRegistrationState covers the lifecycle", () => {
    const states: PushRegistrationState[] = [
      "idle",
      "requesting",
      "granted",
      "denied",
      "undetermined",
      "registered",
      "error",
    ];
    expect(states).toHaveLength(7);
  });

  it("PushTokenRegistrationDeps accepts the expected sync/async shape", async () => {
    const platform: NotificationPlatformInput = "apns";
    const deps: PushTokenRegistrationDeps = {
      requestPermission: async () => "granted" as PushPermissionStatus,
      getDeviceToken: async () => ({ platform, token: "device-token-1" }),
      registerToken: async () => ({ platform, token: "device-token-1" }),
    };
    expect(await deps.requestPermission()).toBe("granted");
    const tok = await deps.getDeviceToken();
    expect(tok.platform).toBe("apns");
    expect(tok.token).toBe("device-token-1");
    await deps.registerToken({ platform, token: tok.token });
  });

  it("PushTokenRegistrationDeps accepts a sync permission requester", async () => {
    const deps: PushTokenRegistrationDeps = {
      requestPermission: () => "denied" as PushPermissionStatus,
      getDeviceToken: async () => ({ platform: "apns", token: "x" }),
      registerToken: async () => undefined,
    };
    expect(await Promise.resolve(deps.requestPermission())).toBe("denied");
  });

  it("registerToken receives the platform-tagged token from the device", async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    const deps: PushTokenRegistrationDeps = {
      requestPermission: async (): Promise<PushPermissionStatus> => "granted",
      getDeviceToken: async () => ({ platform: "apns", token: "tok-1" }),
      registerToken: register,
    };
    const status = await deps.requestPermission();
    if (status === "granted") {
      const t = await deps.getDeviceToken();
      await deps.registerToken({ platform: t.platform, token: t.token });
    }
    expect(register).toHaveBeenCalledWith({ platform: "apns", token: "tok-1" });
  });

  it("supports the fcm platform for Android tokens", async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    const deps: PushTokenRegistrationDeps = {
      requestPermission: async (): Promise<PushPermissionStatus> => "granted",
      getDeviceToken: async () => ({ platform: "fcm", token: "fcm-1" }),
      registerToken: register,
    };
    const t = await deps.getDeviceToken();
    await deps.registerToken({ platform: t.platform, token: t.token });
    expect(register).toHaveBeenCalledWith({ platform: "fcm", token: "fcm-1" });
  });

  it("UsePushTokenRegistrationResult exposes state and request()", () => {
    // Contract assertion only — the shape is what the screen consumes.
    const fake: UsePushTokenRegistrationResult = {
      state: "idle",
      request: async () => {},
    };
    expect(fake.state).toBe("idle");
    expect(typeof fake.request).toBe("function");
  });
});
