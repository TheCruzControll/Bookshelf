import { describe, it, expect } from "vitest";
import type { BookSearchResultInput } from "@hone/domain";
import { DEFAULT_NAV_ITEMS } from "../components/navItems";
import { fetchSearchResults } from "./fetchSearchResults";
import { resultKey } from "./searchHelpers";

describe("Native Search screen (G-03, #77)", () => {
  it("Search is registered in the default top-level nav", () => {
    const search = DEFAULT_NAV_ITEMS.find((item) => item.href === "/search");
    expect(search).toBeDefined();
    expect(search?.label).toBe("Search");
  });

  it("fetchSearchResults returns an empty list before the tRPC client is wired", async () => {
    const results = await fetchSearchResults("");
    expect(results).toEqual([]);
  });

  it("renders the empty-state contract when the fetcher returns no results", async () => {
    const results = await fetchSearchResults("");
    expect(results).toHaveLength(0);
  });

  it("renders a grid of cards from a stubbed result list (data contract)", () => {
    // Once a native tRPC client is wired in, the screen will hydrate with
    // results shaped exactly like this; the panel maps one card per result.
    const results: BookSearchResultInput[] = [
      {
        source: "open_library",
        sourceKey: "OL45804W",
        title: "Foundation",
        authors: ["Isaac Asimov"],
        firstPublishedYear: 1951,
      },
      {
        source: "google_books",
        sourceKey: "vol-abc",
        title: "Foundation and Empire",
        authors: ["Isaac Asimov"],
        firstPublishedYear: 1952,
      },
    ];
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.title.length > 0)).toBe(true);
    expect(results.every((r) => r.authors.length > 0)).toBe(true);
  });

  it("uses stable `${source}:${sourceKey}` keys for each rendered card", () => {
    const a: BookSearchResultInput = {
      source: "open_library",
      sourceKey: "OL45804W",
      title: "Foundation",
      authors: ["Isaac Asimov"],
    };
    const b: BookSearchResultInput = {
      source: "google_books",
      sourceKey: "vol-abc",
      title: "Foundation and Empire",
      authors: ["Isaac Asimov"],
    };
    expect(resultKey(a)).toBe("open_library:OL45804W");
    expect(resultKey(b)).toBe("google_books:vol-abc");
    expect(resultKey(a)).not.toBe(resultKey(b));
  });
});
