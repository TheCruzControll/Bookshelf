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

  const items = await fetchListItems(list.id);

  const isEditorial = list.authorType === "internal_editorial";

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
        </p>
        <h1>{list.name}</h1>
        {list.description ? <p>{list.description}</p> : null}
      </section>

      <section>
        {items.length === 0 ? (
          <p>No books on this list yet.</p>
        ) : (
          <ol>
            {items.map((item) => (
              <li key={item.id}>
                {item.book ? item.book.canonicalTitle : item.bookId}
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
