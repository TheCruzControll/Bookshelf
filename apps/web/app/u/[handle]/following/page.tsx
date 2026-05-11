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

async function fetchFollowing(_userId: string): Promise<Follow[]> {
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
    title: `Following — @${handle} — Hone`,
    robots: { index: true, follow: true },
  };
}

export default async function FollowingPage({ params }: Props) {
  const { handle } = await params;

  const profile = await fetchProfile(handle);
  if (!profile) {
    notFound();
  }

  const following = await fetchFollowing(profile.id);
  const profileMap = await fetchProfilesForFollows(
    following,
    (f) => f.followeeId,
  );

  return (
    <main className="shell">
      <section>
        <p>
          <a href={`/u/${handle}`}>@{handle}</a>
        </p>
        <h1>Following</h1>
        <p className="followListCount">{following.length} following</p>
      </section>

      <section>
        {following.length > 0 ? (
          <ul className="followList">
            {following.map((follow) => {
              const followeeProfile = profileMap.get(follow.followeeId);
              if (!followeeProfile) return null;
              return (
                <li key={follow.id} className="followListItem">
                  <UserCard
                    userId={followeeProfile.id}
                    handle={followeeProfile.handle}
                    displayName={followeeProfile.displayName}
                    avatarUrl={followeeProfile.avatarUrl}
                  />
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="followListEmpty">Not following anyone yet.</p>
        )}
      </section>
    </main>
  );
}
