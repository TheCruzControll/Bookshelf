import { useCallback, useState } from "react";
import { Text, TouchableOpacity, StyleSheet, ActivityIndicator, View } from "react-native";
import type { EntityId } from "@hone/domain";

export interface FollowButtonProps {
  /** The profile ID of the user to follow/unfollow. */
  targetUserId: EntityId;
  /** Whether the current user is initially following the target. */
  initialIsFollowing: boolean;
  /** Called when the user taps Follow. Should call the tRPC mutation. */
  onFollow: (targetUserId: EntityId) => Promise<void>;
  /** Called when the user taps Unfollow. Should call the tRPC mutation. */
  onUnfollow: (targetUserId: EntityId) => Promise<void>;
  /** Whether the button is disabled (e.g. viewing own profile). */
  disabled?: boolean;
}

/**
 * Native parity for the web FollowButton (#92, I-05).
 *
 * Optimistic toggle on press; reverts on failure with an inline error.
 * Pure presentational — the parent injects the tRPC mutations.
 */
export function FollowButton({
  targetUserId,
  initialIsFollowing,
  onFollow,
  onUnfollow,
  disabled = false,
}: FollowButtonProps) {
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePress = useCallback(async () => {
    if (disabled || pending) return;
    const wasFollowing = isFollowing;
    setIsFollowing(!wasFollowing);
    setError(null);
    setPending(true);
    try {
      if (wasFollowing) {
        await onUnfollow(targetUserId);
      } else {
        await onFollow(targetUserId);
      }
    } catch {
      setIsFollowing(wasFollowing);
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }, [disabled, pending, isFollowing, targetUserId, onFollow, onUnfollow]);

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[
          isFollowing ? styles.followingButton : styles.followButton,
          (disabled || pending) && styles.buttonDisabled,
        ]}
        onPress={handlePress}
        disabled={disabled || pending}
        accessibilityRole="button"
        accessibilityState={{ disabled, selected: isFollowing }}
        accessibilityLabel={isFollowing ? "Unfollow" : "Follow"}
      >
        {pending ? (
          <ActivityIndicator color={isFollowing ? "#181512" : "#F7F4ED"} />
        ) : (
          <Text style={isFollowing ? styles.followingLabel : styles.followLabel}>
            {isFollowing ? "Following" : "Follow"}
          </Text>
        )}
      </TouchableOpacity>
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 6 },
  followButton: {
    alignItems: "center",
    backgroundColor: "#253F5B",
    borderRadius: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  followingButton: {
    alignItems: "center",
    backgroundColor: "#FBFAF6",
    borderColor: "#E5DFD3",
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  followLabel: { color: "#F7F4ED", fontSize: 14, fontWeight: "600" },
  followingLabel: { color: "#181512", fontSize: 14, fontWeight: "600" },
  error: { color: "#B9472D", fontSize: 13, lineHeight: 18 },
});
