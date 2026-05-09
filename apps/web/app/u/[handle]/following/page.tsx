import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Profile } from "@hone/domain";

export const revalidate = 60;

type Props = {
  params: Promise<{ handle: string }>;
};

async function fetchProfile(_handle: string): Promise<Profile | null> {
  return null;
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

  return (
    <main className="shell">
      <section>
        <p>
          <a href={`/u/${handle}`}>@{handle}</a>
        </p>
        <h1>Following</h1>
      </section>
    </main>
  );
}
