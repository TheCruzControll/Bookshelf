import type { Metadata } from "next";
import type { BookSearchResultInput, EntityId } from "@hone/domain";
import { Nav } from "../components/Nav";
import { SearchPanel } from "./SearchPanel";
import { fetchSearchResults } from "./fetchSearchResults";
import type { ShelfOption } from "./AddSheet";

export const metadata: Metadata = {
  title: "Search · Hone",
  description:
    "Find a book by title, author, or ISBN — then add it to a shelf.",
};

interface SearchPageProps {
  searchParams: Promise<{ q?: string }>;
}

/**
 * Shelves the AddSheet picker shows to the viewer.
 *
 * V1 stub: the web app has no tRPC client yet, so we hardcode the four
 * system shelves auto-seeded by `profile.createProfile` (PRD-spec). When
 * the client lands, swap this for a `shelf.listMine` call.
 */
const SAMPLE_SHELVES: ShelfOption[] = [
  { id: "00000000-0000-0000-0000-000000000001" as EntityId, name: "Reading", isSystem: true },
  { id: "00000000-0000-0000-0000-000000000002" as EntityId, name: "Want to Read", isSystem: true },
  { id: "00000000-0000-0000-0000-000000000003" as EntityId, name: "Finished", isSystem: true },
  { id: "00000000-0000-0000-0000-000000000004" as EntityId, name: "Dropped", isSystem: true },
];

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q } = await searchParams;
  const initialResults: BookSearchResultInput[] = await fetchSearchResults(
    q ?? "",
  );

  return (
    <main className="shell searchShell">
      <Nav currentPath="/search" />
      <section className="hero">
        <p className="eyebrow">Search</p>
        <h1>Find a book.</h1>
        <p className="lede">
          Search by title, author, or ISBN. Pick a result to add it to a
          shelf, set status, privacy, and a private note.
        </p>
      </section>
      <section className="board" aria-label="Search">
        <SearchPanel
          initialResults={initialResults}
          shelves={SAMPLE_SHELVES}
        />
      </section>
    </main>
  );
}
