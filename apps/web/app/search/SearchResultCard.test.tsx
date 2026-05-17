import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { BookSearchResultInput } from "@hone/domain";
import { SearchResultCard } from "./SearchResultCard";

function makeResult(
  overrides: Partial<BookSearchResultInput> = {},
): BookSearchResultInput {
  return {
    source: "open_library",
    sourceKey: "OL45804W",
    title: "Foundation",
    authors: ["Isaac Asimov"],
    firstPublishedYear: 1951,
    coverUrl: "https://covers.example/foundation.jpg",
    ...overrides,
  };
}

describe("SearchResultCard rendering (G-02, #76)", () => {
  it("renders cover image, title, author, and year", () => {
    const html = renderToStaticMarkup(
      <SearchResultCard result={makeResult()} />,
    );
    expect(html).toContain("Foundation");
    expect(html).toContain("Isaac Asimov");
    expect(html).toContain("1951");
    expect(html).toContain("covers.example/foundation.jpg");
  });

  it("renders a typographic fallback when no coverUrl is provided", () => {
    const html = renderToStaticMarkup(
      <SearchResultCard
        result={makeResult({ coverUrl: undefined, title: "foundation" })}
      />,
    );
    expect(html).toContain("searchResultCardCoverFallback");
    // First-letter fallback, uppercased.
    expect(html).toContain(">F<");
    expect(html).not.toContain("<img");
  });

  it("omits the year when firstPublishedYear is missing", () => {
    const html = renderToStaticMarkup(
      <SearchResultCard
        result={makeResult({ firstPublishedYear: undefined })}
      />,
    );
    expect(html).not.toContain('data-testid="search-result-year"');
  });

  it("formats a two-author list with an ampersand", () => {
    const html = renderToStaticMarkup(
      <SearchResultCard
        result={makeResult({ authors: ["Ada Lovelace", "Grace Hopper"] })}
      />,
    );
    expect(html).toContain("Ada Lovelace &amp; Grace Hopper");
  });

  it("formats 3+ authors with a +N suffix", () => {
    const html = renderToStaticMarkup(
      <SearchResultCard
        result={makeResult({
          authors: ["A", "B", "C", "D"],
        })}
      />,
    );
    expect(html).toContain("A, B, +2");
  });

  it("falls back to 'Unknown author' when authors is empty", () => {
    const html = renderToStaticMarkup(
      <SearchResultCard result={makeResult({ authors: [] })} />,
    );
    expect(html).toContain("Unknown author");
  });

  it("renders the existing user state badge for each ReadingStatus", () => {
    const labels: { status: "want_to_read" | "reading" | "finished" | "dropped"; label: string }[] = [
      { status: "want_to_read", label: "Want to read" },
      { status: "reading", label: "Reading" },
      { status: "finished", label: "Finished" },
      { status: "dropped", label: "Dropped" },
    ];
    for (const { status, label } of labels) {
      const html = renderToStaticMarkup(
        <SearchResultCard
          result={makeResult()}
          existingState={{ status }}
        />,
      );
      expect(html).toContain('data-testid="search-result-state-badge"');
      expect(html).toContain(label);
    }
  });

  it("omits the state badge when status is null (default)", () => {
    const html = renderToStaticMarkup(
      <SearchResultCard result={makeResult()} />,
    );
    expect(html).not.toContain('data-testid="search-result-state-badge"');
  });

  it("renders as a <button> with aria-label when onSelect is supplied", () => {
    const html = renderToStaticMarkup(
      <SearchResultCard
        result={makeResult({ authors: ["Isaac Asimov"] })}
        existingState={{ status: "reading" }}
        onSelect={() => {}}
      />,
    );
    expect(html).toMatch(/<button[^>]*type="button"[^>]*class="searchResultCard"/);
    expect(html).toContain('aria-label="Foundation by Isaac Asimov — Reading"');
  });

  it("renders as a <div> when no onSelect is supplied", () => {
    const html = renderToStaticMarkup(
      <SearchResultCard result={makeResult()} />,
    );
    expect(html).toMatch(/<div[^>]*class="searchResultCard"/);
    expect(html).not.toMatch(/<button[^>]*class="searchResultCard"/);
  });
});
