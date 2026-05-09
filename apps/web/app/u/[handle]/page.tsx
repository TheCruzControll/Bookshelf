import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import type { Profile, Shelf, Review } from "@hone/domain";
import { isPubliclyVisible } from "../visibility";
import { buildProfileMeta } from "../og-meta";
import { fetchCurrentHandleForOldHandle } from "../handle-redirect";

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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const profile = await fetchProfile(handle);
  return buildProfileMeta(handle, profile);
}

export default async function UserProfilePage({ params }: Props) {
  const { handle } = await params;

  const profile = await fetchProfile(handle);

  if (!profile) {
    const currentHandle = await fetchCurrentHandleForOldHandle(handle);
    if (currentHandle) {
      redirect(`/u/${currentHandle}`);
    }
    notFound();
  }

  const [shelves, reviews] = await Promise.all([
    fetchPublicShelves(profile.id),
    fetchPublicReviews(profile.id),
  ]);

  return (
    <main className="shell">
      <section>
        <h1>{profile.displayName}</h1>
        <p>@{profile.handle}</p>
        {profile.bio ? <p>{profile.bio}</p> : null}
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
                <a href={`/u/${handle}/reviews/${review.id}`}>{review.body.slice(0, 120)}</a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
