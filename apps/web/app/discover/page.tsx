import type { Metadata } from "next";
import type { RecommendationInput } from "@hone/domain";
import { Nav } from "../components/Nav";
import { RecBookCard } from "../components/RecBookCard";
import { fetchDiscoverRecommendations } from "./fetchDiscoverRecommendations";

export const metadata: Metadata = {
  title: "Discover · Hone",
  description:
    "Book recommendations from readers you trust — picked for your taste, with a clear reason for every pick.",
};

export default async function DiscoverPage() {
  const recommendations: RecommendationInput[] = await fetchDiscoverRecommendations();

  return (
    <main className="shell discoverShell">
      <Nav currentPath="/discover" />
      <section className="hero">
        <p className="eyebrow">Discover</p>
        <h1>Books picked for your taste.</h1>
        <p className="lede">
          Recommendations from the readers you follow, with a clear &ldquo;why
          this?&rdquo; on every pick.
        </p>
      </section>
      <section className="discoverGrid" aria-label="Recommended books">
        {recommendations.length === 0 ? (
          <p className="discoverEmpty">
            Finish a few books to seed your taste profile, then check back for
            personalized picks.
          </p>
        ) : (
          <ul className="discoverList" role="list">
            {recommendations.map((rec) => (
              <li key={rec.book.id} className="discoverItem">
                <RecBookCard recommendation={rec} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
