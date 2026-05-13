"use client";

import type { ButtonHTMLAttributes } from "react";

export interface NotificationBellProps {
  /** Number of unread in-app notifications. Counts above 99 render as "99+". */
  unreadCount: number;
  /** Called when the user activates the bell (click / Enter). */
  onClick: () => void;
  /** Accessible label override. Defaults to "Notifications (N unread)". */
  ariaLabel?: string;
}

const MAX_BADGE_COUNT = 99;

function formatBadge(count: number): string {
  if (count <= 0) return "";
  if (count > MAX_BADGE_COUNT) return `${MAX_BADGE_COUNT}+`;
  return String(count);
}

export function NotificationBell({
  unreadCount,
  onClick,
  ariaLabel,
}: NotificationBellProps) {
  const safeCount = Math.max(0, Math.floor(unreadCount));
  const badge = formatBadge(safeCount);
  const label =
    ariaLabel ?? `Notifications (${safeCount} unread)`;

  const buttonProps: ButtonHTMLAttributes<HTMLButtonElement> = {
    type: "button",
    className: "notificationBell",
    onClick,
    "aria-label": label,
  };

  return (
    <button {...buttonProps}>
      <span aria-hidden="true" className="notificationBellIcon">
        {"\u{1F514}"}
      </span>
      {badge ? (
        <span className="notificationBellBadge" aria-hidden="true">
          {badge}
        </span>
      ) : null}
    </button>
  );
}
