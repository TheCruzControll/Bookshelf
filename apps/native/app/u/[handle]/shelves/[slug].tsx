import { useLocalSearchParams, useRouter } from "expo-router";
import { ShelfView } from "../../../components/ShelfView";
import type { ShelfViewItem } from "../../../components/ShelfView";

/**
 * Native screen at /u/{handle}/shelves/{slug}.
 *
 * Mirrors the web /u/[handle]/shelves/[slug] page. Data-fetching is
 * intentionally left as a parent-supplied hook seam so the implementer
 * PR for the tRPC wiring can swap in real calls without touching the
 * presentational ShelfView.
 */
export default function ShelfScreen() {
  const params = useLocalSearchParams<{ handle: string; slug: string }>();
  const router = useRouter();

  // Wiring placeholder — replaced when the web→native data layer lands.
  const items: ShelfViewItem[] = [];
  const shelfName = params.slug ?? "";

  return (
    <ShelfView
      shelfName={shelfName}
      items={items}
      onItemPress={(bookId) => {
        router.push(`/books/${bookId}`);
      }}
    />
  );
}
