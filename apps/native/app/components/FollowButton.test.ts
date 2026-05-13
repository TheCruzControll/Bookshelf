import { describe, it, expect } from "vitest";
import type { FollowButtonProps } from "./FollowButton";
import type { EntityId } from "@hone/domain";

describe("FollowButton (native) component contract", () => {
  const targetUserId: EntityId = "00000000-0000-0000-0000-000000000001";

  it("accepts required props", () => {
    const props: FollowButtonProps = {
      targetUserId,
      initialIsFollowing: false,
      onFollow: async () => {},
      onUnfollow: async () => {},
    };
    expect(props.targetUserId).toBe(targetUserId);
    expect(props.initialIsFollowing).toBe(false);
  });

  it("accepts both initial states", () => {
    const a: FollowButtonProps = {
      targetUserId,
      initialIsFollowing: false,
      onFollow: async () => {},
      onUnfollow: async () => {},
    };
    const b: FollowButtonProps = {
      ...a,
      initialIsFollowing: true,
    };
    expect(a.initialIsFollowing).toBe(false);
    expect(b.initialIsFollowing).toBe(true);
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

  it("onFollow / onUnfollow receive the target user id", async () => {
    const followCalls: EntityId[] = [];
    const unfollowCalls: EntityId[] = [];
    const props: FollowButtonProps = {
      targetUserId,
      initialIsFollowing: false,
      onFollow: async (id) => {
        followCalls.push(id);
      },
      onUnfollow: async (id) => {
        unfollowCalls.push(id);
      },
    };
    await props.onFollow(targetUserId);
    await props.onUnfollow(targetUserId);
    expect(followCalls).toEqual([targetUserId]);
    expect(unfollowCalls).toEqual([targetUserId]);
  });
});
