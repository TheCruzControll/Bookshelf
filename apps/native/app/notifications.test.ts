import { describe, it, expect } from "vitest";
import type { NotificationsScreenProps } from "./notifications";
import type { EntityId, InAppNotificationInput } from "@hone/domain";
import type { PushTokenRegistrationDeps } from "./components/usePushTokenRegistration";

const NOW = new Date("2026-05-13T00:00:00Z");

function makeNotification(overrides?: Partial<InAppNotificationInput>): InAppNotificationInput {
  return {
    id: "00000000-0000-0000-0000-000000000001" as EntityId,
    recipientId: "00000000-0000-0000-0000-000000000099" as EntityId,
    actorId: "00000000-0000-0000-0000-000000000002" as EntityId,
    trigger: "new_follower",
    payload: {},
    createdAt: NOW,
    ...overrides,
  };
}

describe("NotificationsScreen (native) contract", () => {
  it("accepts no props (sensible defaults)", () => {
    const props: NotificationsScreenProps = {};
    expect(props.initialNotifications).toBeUndefined();
    expect(props.autoRequestPushPermission).toBeUndefined();
  });

  it("accepts initial notifications, pagination handlers, and mark-read", async () => {
    const marked: EntityId[] = [];
    const props: NotificationsScreenProps = {
      initialNotifications: [makeNotification()],
      hasMore: true,
      onLoadMore: async () => {},
      onMarkRead: async (id) => {
        marked.push(id);
      },
    };
    await props.onMarkRead!("00000000-0000-0000-0000-000000000001" as EntityId);
    expect(marked).toEqual(["00000000-0000-0000-0000-000000000001"]);
    expect(props.initialNotifications).toHaveLength(1);
    expect(props.hasMore).toBe(true);
  });

  it("accepts the push-registration deps seam for the app shell", async () => {
    const deps: PushTokenRegistrationDeps = {
      requestPermission: async (): Promise<"granted" | "denied" | "undetermined"> => "granted",
      getDeviceToken: async () => ({ platform: "apns", token: "tok-1" }),
      registerToken: async () => undefined,
    };
    const props: NotificationsScreenProps = {
      pushRegistrationDeps: deps,
      autoRequestPushPermission: false,
    };
    expect(await props.pushRegistrationDeps!.requestPermission()).toBe("granted");
    expect(props.autoRequestPushPermission).toBe(false);
  });

  it("supports disabling auto-request on mount", () => {
    const props: NotificationsScreenProps = {
      autoRequestPushPermission: false,
    };
    expect(props.autoRequestPushPermission).toBe(false);
  });
});
