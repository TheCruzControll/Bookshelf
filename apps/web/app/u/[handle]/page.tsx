import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Profile, Shelf, Review, Follow } from "@hone/domain";
import { isPubliclyVisible } from "../visibility";
import { buildProfileMeta } from "../og-meta";
import { FollowButton } from "../../components/FollowButton";

export const revalidate = 60;

type Props = {
  params: Promise<{ handle: string }>;
};

async function fetchProfile(_handle: string): Promise<Profile | null> {
  return null;
}

async function fetchPublicShelves(_ownerId: string): Promise<Shelf[]> {
  const shelves: Shelf[] = [];
  return shelves.filter((s) => isPubliclyVisible(s.visibility));
}

async function fetchPublicReviews(_authorId: string): Promise<Review[]> {
  const reviews: Review[] = [];
  return reviews.filter((r) => isPubliclyVisible(r.visibility));
}

async function fetchFollowers(_userId: string): Promise<Follow[]> {
  return [];
}

async function fetchFollowing(_userId: string): Promise<Follow[]> {
  return [];
}

async function fetchIsFollowing(
  _viewerId: string | null,
  _targetId: string,
): Promise<boolean> {
  return false;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const profile = await fetchProfile(handle);
  return buildProfileMeta(handle, profile);
}

export default async function UserProfilePage({ params }: Props) {
  const { handle } = await params;

  const profile = await fetchProfile(handle);

  if (!profile) {
    notFound();
  }

  const [shelves, reviews, followers, following, isFollowing] =
    await Promise.all([
      fetchPublicShelves(profile.id),
      fetchPublicReviews(profile.id),
      fetchFollowers(profile.id),
      fetchFollowing(profile.id),
      fetchIsFollowing(null, profile.id),
    ]);

  const followerCount = followers.length;
  const followingCount = following.length;

  return (
    <main className="shell">
      <section>
        <h1>{profile.displayName}</h1>
        <p>@{profile.handle}</p>
        {profile.bio ? <p>{profile.bio}</p> : null}

        <div className="profileStats">
          <a href={`/u/${handle}/followers`} className="profileStat">
            <strong>{followerCount}</strong>
            <span>{followerCount === 1 ? "Follower" : "Followers"}</span>
          </a>
          <a href={`/u/${handle}/following`} className="profileStat">
            <strong>{followingCount}</strong>
            <span>Following</span>
          </a>
        </div>

        <FollowButton
          targetUserId={profile.id}
          initialIsFollowing={isFollowing}
          onFollow={async () => {}}
          onUnfollow={async () => {}}
        />
      </section>

      {shelves.length > 0 ? (
        <section>
          <h2>Shelves</h2>
          <ul>
            {shelves.map((shelf) => (
              <li key={shelf.id}>
                <a href={`/u/${handle}/shelves/${shelf.slug}`}>{shelf.name}</a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {reviews.length > 0 ? (
        <section>
          <h2>Reviews</h2>
          <ul>
            {reviews.map((review) => (
              <li key={review.id}>
                <a href={`/u/${handle}/reviews/${review.id}`}>
                  {review.body.slice(0, 120)}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
