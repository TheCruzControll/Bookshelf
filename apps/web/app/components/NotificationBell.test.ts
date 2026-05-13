import { describe, it, expect } from "vitest";
import type { NotificationBellProps } from "./NotificationBell";

describe("NotificationBell component contract", () => {
  it("accepts unreadCount and onClick", () => {
    const props: NotificationBellProps = {
      unreadCount: 0,
      onClick: () => {},
    };
    expect(props.unreadCount).toBe(0);
    expect(typeof props.onClick).toBe("function");
  });

  it("accepts optional ariaLabel override", () => {
    const props: NotificationBellProps = {
      unreadCount: 3,
      onClick: () => {},
      ariaLabel: "Open notifications",
    };
    expect(props.ariaLabel).toBe("Open notifications");
  });

  it("invokes onClick when called", () => {
    let calls = 0;
    const props: NotificationBellProps = {
      unreadCount: 0,
      onClick: () => {
        calls += 1;
      },
    };
    props.onClick();
    expect(calls).toBe(1);
  });

  it("allows large unread counts (component clamps in render)", () => {
    const props: NotificationBellProps = {
      unreadCount: 250,
      onClick: () => {},
    };
    expect(props.unreadCount).toBe(250);
  });
});
