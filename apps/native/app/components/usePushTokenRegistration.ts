import { useCallback, useEffect, useRef, useState } from "react";
import type { NotificationPlatformInput } from "@hone/domain";

export type PushPermissionStatus = "granted" | "denied" | "undetermined";

export type PushRegistrationState =
  | "idle"
  | "requesting"
  | "granted"
  | "denied"
  | "undetermined"
  | "registered"
  | "error";

export interface PushTokenRegistrationDeps {
  /**
   * Requests OS push-notification permission. Returns the resulting status.
   * Wired to `Notifications.requestPermissionsAsync()` from expo-notifications
   * at the app shell; kept as a seam so this hook can be tested in Node.
   */
  requestPermission: () => Promise<PushPermissionStatus> | PushPermissionStatus;
  /**
   * Returns the device push token. Wired to
   * `Notifications.getDevicePushTokenAsync()` (APNs on iOS, FCM on Android)
   * at the app shell.
   */
  getDeviceToken: () => Promise<{ platform: NotificationPlatformInput; token: string }>;
  /**
   * Server-side registration. Wired to the tRPC mutation
   * `notifications.registerToken`.
   */
  registerToken: (input: {
    platform: NotificationPlatformInput;
    token: string;
  }) => Promise<unknown>;
}

export interface UsePushTokenRegistrationResult {
  state: PushRegistrationState;
  /**
   * Triggers the permission prompt and, on grant, fetches the device token
   * and POSTs it to the server. Safe to call multiple times; concurrent
   * calls are coalesced.
   */
  request: () => Promise<void>;
}

/**
 * Hook that, on first call (and on app launch when invoked from the root
 * layout), requests OS push permission and — on grant — retrieves the
 * device push token and registers it via `notifications.registerToken`.
 *
 * The component is kept free of expo-notifications imports so tests can
 * run in Node; the app shell injects the real platform calls.
 *
 * Acceptance criteria coverage for #150:
 *   - Token registered after notifications permission grant.
 */
export function usePushTokenRegistration(
  deps: PushTokenRegistrationDeps,
  options: { autoRequestOnMount?: boolean } = {},
): UsePushTokenRegistrationResult {
  const [state, setState] = useState<PushRegistrationState>("idle");
  const inFlight = useRef(false);
  const depsRef = useRef(deps);
  depsRef.current = deps;

  const request = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setState("requesting");
    try {
      const status = await depsRef.current.requestPermission();
      if (status !== "granted") {
        setState(status);
        return;
      }
      setState("granted");
      const { platform, token } = await depsRef.current.getDeviceToken();
      await depsRef.current.registerToken({ platform, token });
      setState("registered");
    } catch {
      setState("error");
    } finally {
      inFlight.current = false;
    }
  }, []);

  const autoRequest = options.autoRequestOnMount === true;
  useEffect(() => {
    if (autoRequest) {
      void request();
    }
  }, [autoRequest, request]);

  return { state, request };
}
