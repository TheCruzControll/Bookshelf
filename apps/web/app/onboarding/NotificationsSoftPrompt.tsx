"use client";

import { useCallback, useState } from "react";

export interface NotificationsSoftPromptProps {
  /**
   * Trigger function called when the user opts into the OS prompt. Defaults
   * to invoking `Notification.requestPermission()` in the browser. Pass an
   * override to make the component testable / to wire it to a native shell.
   */
  requestOsPermission?: () => Promise<NotificationPermission> | NotificationPermission;
}

/**
 * Per the spec, the web (and especially iOS web) flow must show a soft,
 * explanatory prompt BEFORE the native permission dialog. The native
 * dialog is one-shot per origin on iOS; surfacing it cold burns the only
 * chance to opt the user in.
 *
 * This component renders the soft prompt. The native prompt fires only
 * when the user clicks "Enable" — never on mount.
 */
export function NotificationsSoftPrompt({
  requestOsPermission,
}: NotificationsSoftPromptProps) {
  const [state, setState] = useState<"idle" | "asking" | "granted" | "denied" | "default">("idle");

  const handleEnable = useCallback(async () => {
    setState("asking");
    try {
      const fn =
        requestOsPermission ??
        (async () => {
          if (
            typeof globalThis !== "undefined" &&
            typeof (globalThis as { Notification?: { requestPermission?: () => Promise<NotificationPermission> } }).Notification?.requestPermission === "function"
          ) {
            return (globalThis as unknown as { Notification: { requestPermission: () => Promise<NotificationPermission> } }).Notification.requestPermission();
          }
          return "default" as NotificationPermission;
        });
      const result = await fn();
      setState(result === "granted" ? "granted" : result === "denied" ? "denied" : "default");
    } catch {
      setState("default");
    }
  }, [requestOsPermission]);

  return (
    <section
      aria-label="Enable notifications"
      data-testid="notifications-soft-prompt"
      className="softPrompt"
    >
      <p className="softPromptCopy">
        We&apos;ll only ping you for new followers, mutuals rating a book highly,
        mutuals finishing a book on your Want-to-Read shelf, and security
        alerts. You can fine-tune this anytime in Settings.
      </p>

      {state === "idle" || state === "asking" ? (
        <button
          type="button"
          className="onboardingContinue"
          onClick={handleEnable}
          disabled={state === "asking"}
          aria-label="Enable notifications"
          data-testid="notifications-enable"
        >
          {state === "asking" ? "Asking…" : "Enable notifications"}
        </button>
      ) : null}

      {state === "granted" ? (
        <p className="softPromptResult" role="status">
          Notifications enabled.
        </p>
      ) : null}

      {state === "denied" ? (
        <p className="softPromptResult" role="status">
          Notifications were declined. You can enable them later in Settings.
        </p>
      ) : null}

      {state === "default" ? (
        <p className="softPromptResult" role="status">
          You can enable notifications later from Settings.
        </p>
      ) : null}
    </section>
  );
}
