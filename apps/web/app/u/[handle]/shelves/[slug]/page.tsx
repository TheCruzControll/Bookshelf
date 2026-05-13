import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Profile, Shelf, ShelfItem, Book } from "@hone/domain";
import { isPubliclyVisible } from "../../../visibility";
import { buildShelfMeta } from "../../../og-meta";

export const revalidate = 60;

type Props = {
  params: Promise<{ handle: string; slug: string }>;
};

async function fetchProfile(_handle: string): Promise<Profile | null> {
  return null;
}

async function fetchShelfBySlug(_ownerId: string, _slug: string): Promise<Shelf | null> {
  return null;
}

async function fetchShelfItems(_shelfId: string): Promise<Array<ShelfItem & { book?: Book }>> {
  return [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle, slug } = await params;
  const profile = await fetchProfile(handle);
  const shelf = profile ? await fetchShelfBySlug(profile.id, slug) : null;
  return buildShelfMeta(handle, slug, shelf);
}

export default async function ShelfPage({ params }: Props) {
  const { handle, slug } = await params;

  const profile = await fetchProfile(handle);
  if (!profile) {
    notFound();
  }

  const shelf = await fetchShelfBySlug(profile.id, slug);
  if (!shelf || !isPubliclyVisible(shelf.visibility)) {
    notFound();
  }

  const items = await fetchShelfItems(shelf.id);

  return (
    <main className="shell">
      <section>
        <p>
          <a href={`/u/${handle}`}>@{handle}</a>
        </p>
        <h1>{shelf.name}</h1>
        {shelf.description ? <p>{shelf.description}</p> : null}
      </section>

      <section aria-label="Books on this shelf">
        {items.length === 0 ? (
          <p>No books on this shelf yet.</p>
        ) : (
          <ul className="shelfItems">
            {items.map((item) => (
              <li key={item.id} className="shelfItem">
                {item.book?.coverUrl ? (
                  <img
                    src={item.book.coverUrl}
                    alt=""
                    className="shelfItemCover"
                    width={48}
                    height={72}
                  />
                ) : null}
                <a href={`/books/${item.bookId}`} className="shelfItemTitle">
                  {item.book ? item.book.canonicalTitle : item.bookId}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
