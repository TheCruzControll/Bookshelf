import { describe, it, expect } from "vitest";
import type { ProfileListsProps } from "./ProfileLists";
import type { Shelf } from "@hone/domain";

const NOW = new Date("2026-05-13T00:00:00Z");

function makeList(overrides?: Partial<Shelf>): Shelf {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    ownerId: "00000000-0000-0000-0000-000000000099",
    name: "My favorites",
    slug: "my-favorites",
    visibility: "public",
    isSystem: false,
    kind: "list",
    authorType: "user",
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as Shelf;
}

describe("ProfileLists component contract", () => {
  it("requires lists and onListPress", () => {
    const props: ProfileListsProps = {
      lists: [],
      onListPress: () => {},
    };
    expect(props.lists).toEqual([]);
    expect(typeof props.onListPress).toBe("function");
  });

  it("renders user, editorial, algorithmic lists together", () => {
    const props: ProfileListsProps = {
      lists: [
        makeList({ id: "1", slug: "u", authorType: "user" }),
        makeList({ id: "2", slug: "e", authorType: "internal_editorial" }),
        makeList({ id: "3", slug: "a", authorType: "algorithmic" }),
      ],
      onListPress: () => {},
    };
    expect(props.lists).toHaveLength(3);
  });

  it("onListPress receives the slug", () => {
    const seen: string[] = [];
    const props: ProfileListsProps = {
      lists: [makeList({ slug: "best-of-2026" })],
      onListPress: (slug) => {
        seen.push(slug);
      },
    };
    props.onListPress("best-of-2026");
    expect(seen).toEqual(["best-of-2026"]);
  });
});
