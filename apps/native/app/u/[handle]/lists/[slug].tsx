import { useLocalSearchParams, useRouter } from "expo-router";
import { ListView } from "../../../components/ListView";
import type { ListViewItem } from "../../../components/ListView";

/**
 * Native screen at /u/{handle}/lists/{slug}.
 *
 * Mirrors the web /u/[handle]/lists/[slug] page. authorType defaults
 * to "user" until the parent supplies real data; editorial /
 * algorithmic lists get their provenance badge automatically from
 * ListView when the field is supplied.
 */
export default function ListScreen() {
  const params = useLocalSearchParams<{ handle: string; slug: string }>();
  const router = useRouter();

  const items: ListViewItem[] = [];
  const listName = params.slug ?? "";

  return (
    <ListView
      listName={listName}
      authorType="user"
      items={items}
      onItemPress={(bookId) => {
        router.push(`/books/${bookId}`);
      }}
    />
  );
}
