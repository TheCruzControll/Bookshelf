import { describe, it, expect } from "vitest";
import type { ShelfViewItem, ShelfViewProps } from "./ShelfView";

const NOW = new Date("2026-05-13T00:00:00Z");

function makeItem(overrides?: Partial<ShelfViewItem>): ShelfViewItem {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    shelfId: "00000000-0000-0000-0000-000000000010",
    bookId: "00000000-0000-0000-0000-000000000100",
    status: "finished",
    addedAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("ShelfView component contract", () => {
  it("requires shelfName and items", () => {
    const props: ShelfViewProps = {
      shelfName: "Reading",
      items: [],
    };
    expect(props.shelfName).toBe("Reading");
    expect(props.items).toEqual([]);
  });

  it("accepts an optional description and onItemPress", () => {
    const seen: string[] = [];
    const props: ShelfViewProps = {
      shelfName: "Finished",
      description: "Books I've finished",
      items: [makeItem()],
      onItemPress: (bookId) => {
        seen.push(bookId);
      },
    };
    props.onItemPress?.("book-x");
    expect(props.description).toBe("Books I've finished");
    expect(seen).toEqual(["book-x"]);
  });

  it("items match the ShelfItem + optional Book shape", () => {
    const props: ShelfViewProps = {
      shelfName: "Test",
      items: [
        makeItem({
          book: {
            id: "00000000-0000-0000-0000-000000000100",
            canonicalTitle: "Foundation",
            createdAt: NOW,
            updatedAt: NOW,
          },
        }),
      ],
    };
    expect(props.items[0]?.book?.canonicalTitle).toBe("Foundation");
  });
});
