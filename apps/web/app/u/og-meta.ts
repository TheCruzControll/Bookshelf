import type { Metadata } from "next";

export function buildProfileMeta(
  handle: string,
  profile: { displayName: string; bio?: string | undefined; avatarUrl?: string | undefined } | null,
): Metadata {
  const title = profile
    ? `${profile.displayName} (@${handle}) — Hone`
    : `@${handle} — Hone`;
  const description = profile?.bio ?? `${handle}'s reading profile on Hone.`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      ...(profile?.avatarUrl ? { images: [{ url: profile.avatarUrl }] } : {}),
    },
    twitter: {
      card: profile?.avatarUrl ? "summary_large_image" : "summary",
      title,
      description,
      ...(profile?.avatarUrl ? { images: [profile.avatarUrl] } : {}),
    },
  };
}

export function buildShelfMeta(
  handle: string,
  slug: string,
  shelf: { name: string; description?: string | undefined } | null,
): Metadata {
  const title = shelf
    ? `${shelf.name} — @${handle} — Hone`
    : `${slug} — @${handle} — Hone`;
  const description = shelf?.description ?? `${handle}'s shelf on Hone.`;
  return {
    title,
    description,
    openGraph: { title, description },
    twitter: { card: "summary", title, description },
  };
}

export function buildReviewMeta(
  handle: string,
  review: { body: string; book?: { canonicalTitle: string; coverUrl?: string | undefined } | undefined } | null,
): Metadata {
  const bookTitle = review?.book?.canonicalTitle;
  const title = bookTitle
    ? `${bookTitle} — Review by @${handle} — Hone`
    : `Review by @${handle} — Hone`;
  const description = review
    ? review.body.slice(0, 160)
    : `A book review by ${handle} on Hone.`;
  const image = review?.book?.coverUrl;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}

export function buildListMeta(
  handle: string,
  list: { title: string; description?: string | undefined } | null,
): Metadata {
  const title = list
    ? `${list.title} — @${handle} — Hone`
    : `List — @${handle} — Hone`;
  const description = list?.description ?? `A list by ${handle} on Hone.`;
  return {
    title,
    description,
    openGraph: { title, description },
    twitter: { card: "summary", title, description },
  };
}

export function buildBookMeta(
  book: { canonicalTitle: string; description?: string | undefined; coverUrl?: string | undefined } | null,
): Metadata {
  const title = book ? `${book.canonicalTitle} — Hone` : "Book Detail — Hone";
  const description = book?.description ?? "Buy and read this book through your preferred retailer.";
  const image = book?.coverUrl;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}
