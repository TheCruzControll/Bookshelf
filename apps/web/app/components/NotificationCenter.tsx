"use client";

import { useEffect, useRef } from "react";
import type { EntityId, InAppNotificationInput } from "@hone/domain";

export interface NotificationCenterProps {
  /** Notifications to render, newest first. */
  notifications: InAppNotificationInput[];
  /**
   * Called with each unread notification id when the panel mounts.
   * Should call `notifications.markRead` on the server. The component
   * guarantees each id is reported at most once per mount.
   */
  onMarkRead: (notificationId: EntityId) => Promise<void> | void;
  /** Optional handler for loading more (cursor-based pagination). */
  onLoadMore?: () => Promise<void> | void;
  /** Whether more notifications are available. Hides the "Load more" button when false. */
  hasMore?: boolean;
  /** Whether a load is in flight. Disables the "Load more" button. */
  isLoading?: boolean;
}

function renderTriggerLabel(trigger: InAppNotificationInput["trigger"]): string {
  switch (trigger) {
    case "new_follower":
      return "started following you";
    case "mutual_follow_back":
      return "followed you back";
    case "mutual_rated_high":
      return "rated a book highly";
    case "mutual_finished_want_to_read":
      return "finished a book on your Want-to-Read";
    case "security_event":
      return "security alert";
    default:
      return "sent you a notification";
  }
}

export function NotificationCenter({
  notifications,
  onMarkRead,
  onLoadMore,
  hasMore = false,
  isLoading = false,
}: NotificationCenterProps) {
  const reportedRef = useRef<Set<EntityId>>(new Set());

  useEffect(() => {
    for (const n of notifications) {
      if (n.readAt) continue;
      if (reportedRef.current.has(n.id)) continue;
      reportedRef.current.add(n.id);
      void onMarkRead(n.id);
    }
  }, [notifications, onMarkRead]);

  if (notifications.length === 0) {
    return (
      <div className="notificationCenter" role="region" aria-label="Notifications">
        <p className="notificationCenterEmpty">No notifications yet.</p>
      </div>
    );
  }

  return (
    <div className="notificationCenter" role="region" aria-label="Notifications">
      <ul className="notificationCenterList">
        {notifications.map((n) => (
          <li
            key={n.id}
            className={
              n.readAt
                ? "notificationCenterItem notificationCenterItemRead"
                : "notificationCenterItem notificationCenterItemUnread"
            }
          >
            <span className="notificationCenterTrigger">{renderTriggerLabel(n.trigger)}</span>
            <time
              className="notificationCenterTime"
              dateTime={n.createdAt.toISOString()}
            >
              {n.createdAt.toISOString()}
            </time>
            {!n.readAt ? (
              <span className="notificationCenterDot" aria-label="Unread" />
            ) : null}
          </li>
        ))}
      </ul>
      {hasMore && onLoadMore ? (
        <button
          type="button"
          className="notificationCenterLoadMore"
          onClick={() => {
            void onLoadMore();
          }}
          disabled={isLoading}
        >
          {isLoading ? "Loading..." : "Load more"}
        </button>
      ) : null}
    </div>
  );
}
