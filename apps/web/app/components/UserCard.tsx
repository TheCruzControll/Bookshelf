import type { EntityId } from "@hone/domain";

export interface UserCardProps {
  /** User's profile ID */
  userId: EntityId;
  /** Display handle (e.g. "maya") */
  handle: string;
  /** Display name (e.g. "Maya Chen") */
  displayName: string;
  /** Optional avatar URL */
  avatarUrl?: string | undefined;
}

export function UserCard({
  userId: _userId,
  handle,
  displayName,
  avatarUrl,
}: UserCardProps) {
  return (
    <a href={`/u/${handle}`} className="userCard">
      <span className="userCardAvatar" aria-hidden="true">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" width={40} height={40} />
        ) : (
          displayName.charAt(0).toUpperCase()
        )}
      </span>
      <span className="userCardInfo">
        <strong className="userCardName">{displayName}</strong>
        <span className="userCardHandle">@{handle}</span>
      </span>
    </a>
  );
}
