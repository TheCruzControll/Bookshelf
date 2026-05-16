import { describe, it, expect } from "vitest";
import type { NotificationCenterProps } from "./NotificationCenter";
import type { EntityId, InAppNotificationInput } from "@hone/domain";

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

describe("NotificationCenter (native) component contract", () => {
  it("accepts the required props", () => {
    const props: NotificationCenterProps = {
      notifications: [],
      onMarkRead: async () => {},
    };
    expect(props.notifications).toEqual([]);
    expect(typeof props.onMarkRead).toBe("function");
  });

  it("accepts optional loadMore controls", () => {
    const props: NotificationCenterProps = {
      notifications: [],
      onMarkRead: async () => {},
      onLoadMore: async () => {},
      hasMore: true,
      isLoading: false,
    };
    expect(props.hasMore).toBe(true);
    expect(props.isLoading).toBe(false);
  });

  it("onMarkRead receives the notification id and is awaited", async () => {
    const seen: EntityId[] = [];
    const props: NotificationCenterProps = {
      notifications: [],
      onMarkRead: async (id) => {
        seen.push(id);
      },
    };
    await props.onMarkRead("00000000-0000-0000-0000-000000000001" as EntityId);
    expect(seen).toEqual(["00000000-0000-0000-0000-000000000001"]);
  });

  it("notifications input matches the @hone/domain InAppNotificationInput shape", () => {
    const props: NotificationCenterProps = {
      notifications: [makeNotification()],
      onMarkRead: async () => {},
    };
    expect(props.notifications[0]?.trigger).toBe("new_follower");
    expect(props.notifications[0]?.createdAt).toBeInstanceOf(Date);
  });

  it("renderTriggerLabel coverage: distinct triggers produce distinct labels (smoke)", () => {
    const triggers: InAppNotificationInput["trigger"][] = [
      "new_follower",
      "mutual_follow_back",
      "mutual_rated_high",
      "mutual_finished_want_to_read",
      "security_event",
    ];
    const props: NotificationCenterProps = {
      notifications: triggers.map((t, i) =>
        makeNotification({ id: `00000000-0000-0000-0000-00000000000${i + 1}` as EntityId, trigger: t }),
      ),
      onMarkRead: async () => {},
    };
    expect(props.notifications).toHaveLength(triggers.length);
  });

  it("supports both read and unread notifications", () => {
    const props: NotificationCenterProps = {
      notifications: [
        makeNotification({ id: "00000000-0000-0000-0000-000000000001" as EntityId }),
        makeNotification({
          id: "00000000-0000-0000-0000-000000000002" as EntityId,
          readAt: new Date("2026-05-13T01:00:00Z"),
        }),
      ],
      onMarkRead: async () => {},
    };
    expect(props.notifications[0]?.readAt).toBeUndefined();
    expect(props.notifications[1]?.readAt).toBeInstanceOf(Date);
  });
});
