import { describe, it, expect } from "vitest";
import type { ListViewItem, ListViewProps } from "./ListView";
import type { ShelfAuthorType } from "@hone/domain";

const NOW = new Date("2026-05-13T00:00:00Z");

function makeItem(overrides?: Partial<ListViewItem>): ListViewItem {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    listId: "00000000-0000-0000-0000-000000000010",
    bookId: "00000000-0000-0000-0000-000000000100",
    position: 1,
    addedAt: NOW,
    ...overrides,
  };
}

describe("ListView component contract", () => {
  it("requires listName, authorType, and items", () => {
    const props: ListViewProps = {
      listName: "Sci-Fi favorites",
      authorType: "user",
      items: [],
    };
    expect(props.listName).toBe("Sci-Fi favorites");
    expect(props.authorType).toBe("user");
    expect(props.items).toEqual([]);
  });

  it("accepts all three author types so editorial / algorithmic lists land on equal footing", () => {
    const tiers: ShelfAuthorType[] = ["user", "internal_editorial", "algorithmic"];
    for (const t of tiers) {
      const props: ListViewProps = {
        listName: "Test",
        authorType: t,
        items: [],
      };
      expect(props.authorType).toBe(t);
    }
  });

  it("accepts optional description and onItemPress", () => {
    const seen: string[] = [];
    const props: ListViewProps = {
      listName: "Test",
      description: "An editorial pick.",
      authorType: "internal_editorial",
      items: [makeItem()],
      onItemPress: (id) => {
        seen.push(id);
      },
    };
    props.onItemPress?.("book-1");
    expect(props.description).toBe("An editorial pick.");
    expect(seen).toEqual(["book-1"]);
  });
});
