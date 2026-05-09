import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Profile } from "@hone/domain";
import { indexRobots } from "../../../robots-meta";

export const revalidate = 60;

type Props = {
  params: Promise<{ handle: string }>;
};

async function fetchProfile(handle: string): Promise<Profile | null> {
  return null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  return {
    title: `Followers of @${handle} — Hone`,
    description: `People who follow ${handle} on Hone.`,
    robots: indexRobots,
  };
}

export default async function FollowersPage({ params }: Props) {
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
        <h1>Followers</h1>
      </section>
    </main>
  );
}
