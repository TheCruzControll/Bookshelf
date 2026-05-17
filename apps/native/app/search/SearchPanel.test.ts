import { describe, it, expect } from "vitest";
import type { BookSearchResultInput, EntityId } from "@hone/domain";
import type { ShelfOption, AddSheetSubmission } from "./AddSheet";
import { resultKey } from "./searchHelpers";
import type { SearchBackend, SearchPanelProps } from "./SearchPanel";

const SHELVES: ShelfOption[] = [
  {
    id: "00000000-0000-0000-0000-0000000000a1" as EntityId,
    name: "Reading",
    isSystem: true,
  },
];

function makeResult(
  overrides: Partial<BookSearchResultInput> = {},
): BookSearchResultInput {
  return {
    source: "open_library",
    sourceKey: "OL45804W",
    title: "Foundation",
    authors: ["Isaac Asimov"],
    firstPublishedYear: 1951,
    ...overrides,
  };
}

describe("SearchPanel contract (native, G-03, #77)", () => {
  it("requires shelves; initialResults + backend + existingStateByKey are optional", () => {
    const props: SearchPanelProps = { shelves: SHELVES };
    expect(props.shelves).toHaveLength(1);
    expect(props.initialResults).toBeUndefined();
    expect(props.backend).toBeUndefined();
    expect(props.existingStateByKey).toBeUndefined();
  });

  it("accepts an initialResults seed for first paint", () => {
    const initialResults: BookSearchResultInput[] = [makeResult()];
    const props: SearchPanelProps = {
      shelves: SHELVES,
      initialResults,
    };
    expect(props.initialResults).toHaveLength(1);
  });

  it("backend.searchByText is called for free-text queries", async () => {
    const calls: string[] = [];
    const backend: SearchBackend = {
      async searchByText(query) {
        calls.push(query);
        return [makeResult({ title: query })];
      },
      async lookupByIsbn() {
        return null;
      },
    };
    const result = await backend.searchByText("Foundation");
    expect(calls).toEqual(["Foundation"]);
    expect(result[0]?.title).toBe("Foundation");
  });

  it("backend.lookupByIsbn is called for ISBN queries", async () => {
    const calls: string[] = [];
    const backend: SearchBackend = {
      async searchByText() {
        return [];
      },
      async lookupByIsbn(isbn) {
        calls.push(isbn);
        return makeResult();
      },
    };
    const result = await backend.lookupByIsbn("9780553293357");
    expect(calls).toEqual(["9780553293357"]);
    expect(result?.title).toBe("Foundation");
  });

  it("backend.saveBook receives the selected book + AddSheetSubmission", async () => {
    const calls: Array<{
      book: BookSearchResultInput;
      submission: AddSheetSubmission;
    }> = [];
    const backend: SearchBackend = {
      async searchByText() {
        return [];
      },
      async lookupByIsbn() {
        return null;
      },
      async saveBook(args) {
        calls.push(args);
      },
    };
    const book = makeResult();
    const submission: AddSheetSubmission = {
      status: "reading",
      shelfId: SHELVES[0]!.id,
      visibility: "followers",
      note: "",
    };
    await backend.saveBook?.({ book, submission });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.book.title).toBe("Foundation");
    expect(calls[0]?.submission).toEqual(submission);
  });

  it("resultKey produces a stable `${source}:${sourceKey}` join", () => {
    expect(resultKey(makeResult())).toBe("open_library:OL45804W");
    expect(
      resultKey(makeResult({ source: "google_books", sourceKey: "vol-abc" })),
    ).toBe("google_books:vol-abc");
  });

  it("existingStateByKey is keyed by resultKey", () => {
    const r = makeResult();
    const props: SearchPanelProps = {
      shelves: SHELVES,
      existingStateByKey: {
        [resultKey(r)]: { status: "reading" },
      },
    };
    expect(props.existingStateByKey?.[resultKey(r)]?.status).toBe("reading");
  });
});
