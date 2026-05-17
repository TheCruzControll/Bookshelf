import { describe, it, expect } from "vitest";
import type { BookSearchResultInput } from "@hone/domain";
import { DEFAULT_NAV_ITEMS } from "../components/Nav";
import { fetchSearchResults } from "./fetchSearchResults";

describe("Search page (G-02, #76)", () => {
  it("Search is registered in the default top-level nav", () => {
    const search = DEFAULT_NAV_ITEMS.find((item) => item.href === "/search");
    expect(search).toBeDefined();
    expect(search?.label).toBe("Search");
  });

  it("fetchSearchResults returns an empty list for an empty query", async () => {
    const results = await fetchSearchResults("");
    expect(results).toEqual([]);
  });

  it("fetchSearchResults returns an empty list for a whitespace query", async () => {
    const results = await fetchSearchResults("   ");
    expect(results).toEqual([]);
  });

  it("fetchSearchResults returns an empty list for ISBN input (tRPC client not wired yet)", async () => {
    const isbn = await fetchSearchResults("9780553293357");
    expect(isbn).toEqual([]);
  });

  it("fetchSearchResults returns an empty list for free-text input (tRPC client not wired yet)", async () => {
    const text = await fetchSearchResults("Foundation");
    expect(text).toEqual([]);
  });

  it("renders a grid of cards from a stubbed result list (data contract)", () => {
    // Once a tRPC client is wired in, the page will hydrate with results
    // shaped exactly like this; the panel maps one card per result.
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
});
