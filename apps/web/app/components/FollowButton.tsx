"use client";

import { useState, useCallback, useTransition } from "react";
import type { EntityId } from "@hone/domain";

export interface FollowButtonProps {
  /** The profile ID of the user to follow/unfollow. */
  targetUserId: EntityId;
  /** Whether the current user is initially following the target. */
  initialIsFollowing: boolean;
  /** Called when the user clicks follow. Should call the tRPC mutation. */
  onFollow: (targetUserId: EntityId) => Promise<void>;
  /** Called when the user clicks unfollow. Should call the tRPC mutation. */
  onUnfollow: (targetUserId: EntityId) => Promise<void>;
  /** Whether the button is disabled (e.g. viewing own profile). */
  disabled?: boolean;
}

export function FollowButton({
  targetUserId,
  initialIsFollowing,
  onFollow,
  onUnfollow,
  disabled = false,
}: FollowButtonProps) {
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleClick = useCallback(() => {
    if (disabled || isPending) return;

    const wasFollowing = isFollowing;

    // Optimistic update
    setIsFollowing(!wasFollowing);
    setError(null);

    startTransition(async () => {
      try {
        if (wasFollowing) {
          await onUnfollow(targetUserId);
        } else {
          await onFollow(targetUserId);
        }
      } catch {
        // Revert optimistic update on failure
        setIsFollowing(wasFollowing);
        setError("Something went wrong. Please try again.");
      }
    });
  }, [disabled, isPending, isFollowing, targetUserId, onFollow, onUnfollow]);

  return (
    <div>
      <button
        type="button"
        className={isFollowing ? "followButtonFollowing" : "followButton"}
        onClick={handleClick}
        disabled={disabled || isPending}
        aria-label={isFollowing ? "Unfollow" : "Follow"}
        aria-pressed={isFollowing}
      >
        {isPending
          ? isFollowing
            ? "Following..."
            : "Unfollowing..."
          : isFollowing
            ? "Following"
            : "Follow"}
      </button>
      {error ? (
        <p className="followButtonError" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
