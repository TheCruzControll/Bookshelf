import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Profile, Review, Book } from "@hone/domain";
import { isPubliclyVisible } from "../../../visibility";

export const revalidate = 60;

type Props = {
  params: Promise<{ handle: string; id: string }>;
};

async function fetchProfile(handle: string): Promise<Profile | null> {
  return null;
}

async function fetchReview(reviewId: string): Promise<(Review & { book?: Book }) | null> {
  return null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  return {
    title: `Review by @${handle} — Hone`,
    description: `A book review by ${handle} on Hone.`,
  };
}

export default async function ReviewPage({ params }: Props) {
  const { handle, id } = await params;

  const profile = await fetchProfile(handle);
  if (!profile) {
    notFound();
  }

  const review = await fetchReview(id);
  if (!review || review.authorId !== profile.id || !isPubliclyVisible(review.visibility)) {
    notFound();
  }

  return (
    <main className="shell">
      <section>
        <p>
          <a href={`/u/${handle}`}>@{handle}</a>
        </p>
        {review.book ? <h1>{review.book.canonicalTitle}</h1> : null}
        <article>
          <p>{review.body}</p>
          <time dateTime={review.createdAt.toISOString()}>
            {review.createdAt.toLocaleDateString()}
          </time>
        </article>
      </section>
    </main>
  );
}
