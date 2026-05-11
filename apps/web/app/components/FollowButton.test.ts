import { describe, it, expect } from "vitest";
import type { FollowButtonProps } from "./FollowButton";
import type { EntityId } from "@hone/domain";

describe("FollowButton component contract", () => {
  const targetUserId: EntityId = "00000000-0000-0000-0000-000000000001";

  it("accepts required props for follow state", () => {
    const props: FollowButtonProps = {
      targetUserId,
      initialIsFollowing: false,
      onFollow: async () => {},
      onUnfollow: async () => {},
    };
    expect(props.targetUserId).toBe(targetUserId);
    expect(props.initialIsFollowing).toBe(false);
  });

  it("accepts required props for following state", () => {
    const props: FollowButtonProps = {
      targetUserId,
      initialIsFollowing: true,
      onFollow: async () => {},
      onUnfollow: async () => {},
    };
    expect(props.initialIsFollowing).toBe(true);
  });

  it("accepts optional disabled prop", () => {
    const props: FollowButtonProps = {
      targetUserId,
      initialIsFollowing: false,
      onFollow: async () => {},
      onUnfollow: async () => {},
      disabled: true,
    };
    expect(props.disabled).toBe(true);
  });

  it("onFollow receives the target user ID", async () => {
    const calls: EntityId[] = [];
    const props: FollowButtonProps = {
      targetUserId,
      initialIsFollowing: false,
      onFollow: async (id) => {
        calls.push(id);
      },
      onUnfollow: async () => {},
    };
    await props.onFollow(targetUserId);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe(targetUserId);
  });

  it("onUnfollow receives the target user ID", async () => {
    const calls: EntityId[] = [];
    const props: FollowButtonProps = {
      targetUserId,
      initialIsFollowing: true,
      onFollow: async () => {},
      onUnfollow: async (id) => {
        calls.push(id);
      },
    };
    await props.onUnfollow(targetUserId);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe(targetUserId);
  });

  it("onFollow propagates errors for optimistic revert", async () => {
    const networkError = new Error("Network error");
    const props: FollowButtonProps = {
      targetUserId,
      initialIsFollowing: false,
      onFollow: async () => {
        throw networkError;
      },
      onUnfollow: async () => {},
    };
    await expect(props.onFollow(targetUserId)).rejects.toThrow("Network error");
  });

  it("onUnfollow propagates errors for optimistic revert", async () => {
    const networkError = new Error("Server error");
    const props: FollowButtonProps = {
      targetUserId,
      initialIsFollowing: true,
      onFollow: async () => {},
      onUnfollow: async () => {
        throw networkError;
      },
    };
    await expect(props.onUnfollow(targetUserId)).rejects.toThrow("Server error");
  });

  it("onFollow is idempotent when called multiple times", async () => {
    let callCount = 0;
    const props: FollowButtonProps = {
      targetUserId,
      initialIsFollowing: false,
      onFollow: async () => {
        callCount++;
      },
      onUnfollow: async () => {},
    };
    await props.onFollow(targetUserId);
    await props.onFollow(targetUserId);
    expect(callCount).toBe(2);
  });

  it("disabled defaults to false when omitted", () => {
    const props: FollowButtonProps = {
      targetUserId,
      initialIsFollowing: false,
      onFollow: async () => {},
      onUnfollow: async () => {},
    };
    expect(props.disabled).toBeUndefined();
  });
});
