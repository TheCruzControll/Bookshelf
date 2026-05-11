import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Profile, Follow } from "@hone/domain";
import { UserCard } from "../../../components/UserCard";

export const revalidate = 60;

type Props = {
  params: Promise<{ handle: string }>;
};

async function fetchProfile(_handle: string): Promise<Profile | null> {
  return null;
}

async function fetchFollowers(_userId: string): Promise<Follow[]> {
  return [];
}

async function fetchProfilesForFollows(
  _follows: Follow[],
  _idSelector: (f: Follow) => string,
): Promise<Map<string, Profile>> {
  return new Map();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  return {
    title: `Followers of @${handle} — Hone`,
    robots: { index: true, follow: true },
  };
}

export default async function FollowersPage({ params }: Props) {
  const { handle } = await params;

  const profile = await fetchProfile(handle);
  if (!profile) {
    notFound();
  }

  const followers = await fetchFollowers(profile.id);
  const profileMap = await fetchProfilesForFollows(
    followers,
    (f) => f.followerId,
  );

  return (
    <main className="shell">
      <section>
        <p>
          <a href={`/u/${handle}`}>@{handle}</a>
        </p>
        <h1>Followers</h1>
        <p className="followListCount">
          {followers.length}{" "}
          {followers.length === 1 ? "follower" : "followers"}
        </p>
      </section>

      <section>
        {followers.length > 0 ? (
          <ul className="followList">
            {followers.map((follow) => {
              const followerProfile = profileMap.get(follow.followerId);
              if (!followerProfile) return null;
              return (
                <li key={follow.id} className="followListItem">
                  <UserCard
                    userId={followerProfile.id}
                    handle={followerProfile.handle}
                    displayName={followerProfile.displayName}
                    avatarUrl={followerProfile.avatarUrl}
                  />
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="followListEmpty">No followers yet.</p>
        )}
      </section>
    </main>
  );
}
