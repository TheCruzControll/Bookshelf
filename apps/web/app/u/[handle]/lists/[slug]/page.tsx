import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Profile, Shelf, ListItem, Book } from "@hone/domain";
import { isPubliclyVisible } from "../../../visibility";
import { buildListMeta } from "../../../og-meta";

export const revalidate = 60;

type Props = {
  params: Promise<{ handle: string; slug: string }>;
};

async function fetchProfile(_handle: string): Promise<Profile | null> {
  return null;
}

async function fetchList(_listId: string): Promise<Shelf | null> {
  return null;
}

async function fetchListItems(_listId: string): Promise<Array<ListItem & { book?: Book }>> {
  return [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle, slug } = await params;
  const profile = await fetchProfile(handle);
  const list = profile ? await fetchList(slug) : null;
  return buildListMeta(handle, list ? { title: list.name, description: list.description } : null);
}

export default async function ListPage({ params }: Props) {
  const { handle, slug } = await params;

  const profile = await fetchProfile(handle);
  if (!profile) {
    notFound();
  }

  const list = await fetchList(slug);
  if (!list || list.ownerId !== profile.id || !isPubliclyVisible(list.visibility)) {
    notFound();
  }

  // Editorial and algorithmic lists are discoverable on equal footing with
  // user lists (#130). The author-type chip signals provenance without
  // hiding the list from the rest of the profile surface.
  const items = await fetchListItems(list.id);

  const isEditorial = list.authorType === "internal_editorial";
  const isAlgorithmic = list.authorType === "algorithmic";

  return (
    <main className="shell">
      <section>
        <p>
          <a href={`/u/${handle}`}>@{handle}</a>
          {isEditorial ? (
            <span className="badge badge--verified" aria-label="Verified editorial list">
              Verified
            </span>
          ) : null}
          {isAlgorithmic ? (
            <span className="badge badge--algorithmic" aria-label="Algorithmic list">
              Curated by Hone
            </span>
          ) : null}
        </p>
        <h1>{list.name}</h1>
        {list.description ? <p>{list.description}</p> : null}
      </section>

      <section aria-label="Books on this list">
        {items.length === 0 ? (
          <p>No books on this list yet.</p>
        ) : (
          <ol className="listItems">
            {items.map((item) => (
              <li key={item.id} className="listItem">
                {item.book?.coverUrl ? (
                  <img
                    src={item.book.coverUrl}
                    alt=""
                    className="listItemCover"
                    width={48}
                    height={72}
                  />
                ) : null}
                <a href={`/books/${item.bookId}`} className="listItemTitle">
                  {item.book ? item.book.canonicalTitle : item.bookId}
                </a>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
