import { describe, it, expect } from "vitest";
import type { SearchInputProps } from "./SearchInput";
import type { ParsedQuery } from "./isbnQuery";
import { parseSearchQuery } from "./isbnQuery";

describe("SearchInput contract (G-02, #76)", () => {
  it("accepts the required onQueryChange prop", () => {
    const props: SearchInputProps = {
      onQueryChange: () => {},
    };
    expect(typeof props.onQueryChange).toBe("function");
  });

  it("accepts optional placeholder, initialValue, and debounceMs", () => {
    const props: SearchInputProps = {
      initialValue: "Foundation",
      placeholder: "Find a book",
      debounceMs: 500,
      onQueryChange: () => {},
    };
    expect(props.initialValue).toBe("Foundation");
    expect(props.placeholder).toBe("Find a book");
    expect(props.debounceMs).toBe(500);
  });

  it("defaults debounceMs to undefined (component picks 300ms)", () => {
    const props: SearchInputProps = {
      onQueryChange: () => {},
    };
    expect(props.debounceMs).toBeUndefined();
  });

  it("onQueryChange receives a ParsedQuery shape (empty)", () => {
    const calls: ParsedQuery[] = [];
    const props: SearchInputProps = {
      onQueryChange: (parsed) => calls.push(parsed),
    };
    props.onQueryChange(parseSearchQuery(""));
    expect(calls).toEqual([{ kind: "empty" }]);
  });

  it("onQueryChange routes ISBN-13 input to catalog.byIsbn", () => {
    const calls: ParsedQuery[] = [];
    const props: SearchInputProps = {
      onQueryChange: (parsed) => calls.push(parsed),
    };
    props.onQueryChange(parseSearchQuery("978-0-553-29335-7"));
    expect(calls).toEqual([{ kind: "isbn", isbn: "9780553293357" }]);
  });

  it("onQueryChange routes ISBN-10 (with optional X) to catalog.byIsbn", () => {
    const calls: ParsedQuery[] = [];
    const props: SearchInputProps = {
      onQueryChange: (parsed) => calls.push(parsed),
    };
    props.onQueryChange(parseSearchQuery("043942089X"));
    expect(calls).toEqual([{ kind: "isbn", isbn: "043942089X" }]);
  });

  it("onQueryChange routes text input to catalog.search", () => {
    const calls: ParsedQuery[] = [];
    const props: SearchInputProps = {
      onQueryChange: (parsed) => calls.push(parsed),
    };
    props.onQueryChange(parseSearchQuery("Isaac Asimov"));
    expect(calls).toEqual([{ kind: "text", query: "Isaac Asimov" }]);
  });
});
