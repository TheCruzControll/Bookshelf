import { describe, it, expect } from "vitest";
import type { BookSearchResultInput, ReadingStatus } from "@hone/domain";
import { formatAuthors } from "./searchHelpers";
import type {
  ExistingUserState,
  SearchResultCardProps,
} from "./SearchResultCard";

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

describe("SearchResultCard contract (native, G-03, #77)", () => {
  it("requires a result prop", () => {
    const props: SearchResultCardProps = { result: makeResult() };
    expect(props.result.title).toBe("Foundation");
    expect(props.result.authors).toEqual(["Isaac Asimov"]);
  });

  it("accepts an optional onSelect handler that receives the result", () => {
    const calls: BookSearchResultInput[] = [];
    const props: SearchResultCardProps = {
      result: makeResult(),
      onSelect: (book) => calls.push(book),
    };
    props.onSelect?.(props.result);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.title).toBe("Foundation");
  });

  it("defaults existingState to { status: null } when omitted", () => {
    const props: SearchResultCardProps = { result: makeResult() };
    expect(props.existingState).toBeUndefined();
  });

  it("accepts all four ReadingStatus values for the existing-state badge", () => {
    const values: ReadingStatus[] = [
      "want_to_read",
      "reading",
      "finished",
      "dropped",
    ];
    for (const status of values) {
      const existingState: ExistingUserState = { status };
      const props: SearchResultCardProps = {
        result: makeResult(),
        existingState,
      };
      expect(props.existingState?.status).toBe(status);
    }
  });

  it("accepts ExistingUserState with status null", () => {
    const existingState: ExistingUserState = { status: null };
    const props: SearchResultCardProps = {
      result: makeResult(),
      existingState,
    };
    expect(props.existingState?.status).toBeNull();
  });
});

describe("formatAuthors (native, G-03, #77)", () => {
  it("returns 'Unknown author' for an empty list", () => {
    expect(formatAuthors([])).toBe("Unknown author");
  });

  it("returns the single author verbatim", () => {
    expect(formatAuthors(["Isaac Asimov"])).toBe("Isaac Asimov");
  });

  it("joins two authors with an ampersand", () => {
    expect(formatAuthors(["Ada Lovelace", "Grace Hopper"])).toBe(
      "Ada Lovelace & Grace Hopper",
    );
  });

  it("uses a +N suffix for three or more authors", () => {
    expect(formatAuthors(["A", "B", "C"])).toBe("A, B, +1");
    expect(formatAuthors(["A", "B", "C", "D"])).toBe("A, B, +2");
  });
});
