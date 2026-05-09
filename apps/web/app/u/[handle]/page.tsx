import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Profile, Shelf, Review } from "@hone/domain";
import { isPubliclyVisible } from "../visibility";

export const revalidate = 60;

type Props = {
  params: Promise<{ handle: string }>;
};

async function fetchProfile(handle: string): Promise<Profile | null> {
  return null;
}

async function fetchPublicShelves(ownerId: string): Promise<Shelf[]> {
  return [];
}

async function fetchPublicReviews(authorId: string): Promise<Review[]> {
  return [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  return {
    title: `@${handle} — Hone`,
    description: `${handle}'s reading profile on Hone.`,
  };
}

export default async function UserProfilePage({ params }: Props) {
  const { handle } = await params;

  const profile = await fetchProfile(handle);

  if (!profile) {
    notFound();
  }

  const [shelves, reviews] = await Promise.all([
    fetchPublicShelves(profile.id),
    fetchPublicReviews(profile.id),
  ]);

  const visibleShelves = shelves.filter((s) => isPubliclyVisible(s.visibility));
  const visibleReviews = reviews.filter((r) => isPubliclyVisible(r.visibility));

  return (
    <main className="shell">
      <section>
        <h1>{profile.displayName}</h1>
        <p>@{profile.handle}</p>
        {profile.bio ? <p>{profile.bio}</p> : null}
      </section>

      {visibleShelves.length > 0 ? (
        <section>
          <h2>Shelves</h2>
          <ul>
            {visibleShelves.map((shelf) => (
              <li key={shelf.id}>
                <a href={`/u/${handle}/shelves/${shelf.slug}`}>{shelf.name}</a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {visibleReviews.length > 0 ? (
        <section>
          <h2>Reviews</h2>
          <ul>
            {visibleReviews.map((review) => (
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
