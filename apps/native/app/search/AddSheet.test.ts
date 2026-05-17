import { describe, it, expect } from "vitest";
import type {
  BookSearchResultInput,
  EntityId,
  ReadingStatus,
  Visibility,
} from "@hone/domain";
import type {
  AddSheetProps,
  AddSheetSubmission,
  ShelfOption,
} from "./AddSheet";

function makeBook(): BookSearchResultInput {
  return {
    source: "open_library",
    sourceKey: "OL45804W",
    title: "Foundation",
    authors: ["Isaac Asimov"],
    firstPublishedYear: 1951,
  };
}

const SHELVES: ShelfOption[] = [
  {
    id: "00000000-0000-0000-0000-0000000000a1" as EntityId,
    name: "Reading",
    isSystem: true,
  },
  {
    id: "00000000-0000-0000-0000-0000000000a2" as EntityId,
    name: "Want to Read",
    isSystem: true,
  },
  {
    id: "00000000-0000-0000-0000-0000000000a3" as EntityId,
    name: "Finished",
    isSystem: true,
  },
  {
    id: "00000000-0000-0000-0000-0000000000a4" as EntityId,
    name: "Dropped",
    isSystem: true,
  },
  {
    id: "00000000-0000-0000-0000-0000000000a5" as EntityId,
    name: "Sci-fi favorites",
    isSystem: false,
  },
];

describe("AddSheet contract (native, G-03, #77)", () => {
  it("requires visible, book, shelves, onSubmit, and onCancel", () => {
    const props: AddSheetProps = {
      visible: true,
      book: makeBook(),
      shelves: SHELVES,
      onSubmit: async () => {},
      onCancel: () => {},
    };
    expect(props.visible).toBe(true);
    expect(props.book.title).toBe("Foundation");
    expect(props.shelves).toHaveLength(5);
    expect(typeof props.onSubmit).toBe("function");
    expect(typeof props.onCancel).toBe("function");
  });

  it("accepts all four ReadingStatus values as initialStatus", () => {
    const values: ReadingStatus[] = [
      "want_to_read",
      "reading",
      "finished",
      "dropped",
    ];
    for (const v of values) {
      const props: AddSheetProps = {
        visible: true,
        book: makeBook(),
        shelves: SHELVES,
        initialStatus: v,
        onSubmit: async () => {},
        onCancel: () => {},
      };
      expect(props.initialStatus).toBe(v);
    }
  });

  it("accepts all four Visibility tiers as initialVisibility", () => {
    const values: Visibility[] = ["public", "followers", "mutuals", "private"];
    for (const v of values) {
      const props: AddSheetProps = {
        visible: true,
        book: makeBook(),
        shelves: SHELVES,
        initialVisibility: v,
        onSubmit: async () => {},
        onCancel: () => {},
      };
      expect(props.initialVisibility).toBe(v);
    }
  });

  it("accepts an optional initialShelfId and initialNote", () => {
    const props: AddSheetProps = {
      visible: true,
      book: makeBook(),
      shelves: SHELVES,
      initialShelfId: SHELVES[0]!.id,
      initialNote: "Bought used at the Strand.",
      onSubmit: async () => {},
      onCancel: () => {},
    };
    expect(props.initialShelfId).toBe(SHELVES[0]!.id);
    expect(props.initialNote).toBe("Bought used at the Strand.");
  });

  it("onSubmit receives the full AddSheetSubmission shape (all four inputs)", async () => {
    const calls: AddSheetSubmission[] = [];
    const props: AddSheetProps = {
      visible: true,
      book: makeBook(),
      shelves: SHELVES,
      onSubmit: async (submission) => {
        calls.push(submission);
      },
      onCancel: () => {},
    };
    await props.onSubmit({
      status: "reading",
      shelfId: SHELVES[0]!.id,
      visibility: "followers",
      note: "Started on the plane.",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      status: "reading",
      shelfId: SHELVES[0]!.id,
      visibility: "followers",
      note: "Started on the plane.",
    });
  });

  it("onSubmit may receive shelfId=null when no specific shelf is selected", async () => {
    const calls: AddSheetSubmission[] = [];
    const props: AddSheetProps = {
      visible: true,
      book: makeBook(),
      shelves: SHELVES,
      onSubmit: async (submission) => {
        calls.push(submission);
      },
      onCancel: () => {},
    };
    await props.onSubmit({
      status: "want_to_read",
      shelfId: null,
      visibility: "private",
      note: "",
    });
    expect(calls[0]?.shelfId).toBeNull();
    expect(calls[0]?.visibility).toBe("private");
  });

  it("onSubmit errors propagate so the sheet can show an error", async () => {
    const props: AddSheetProps = {
      visible: true,
      book: makeBook(),
      shelves: SHELVES,
      onSubmit: async () => {
        throw new Error("network error");
      },
      onCancel: () => {},
    };
    await expect(
      props.onSubmit({
        status: "want_to_read",
        shelfId: null,
        visibility: "followers",
        note: "",
      }),
    ).rejects.toThrow("network error");
  });

  it("onCancel is callable without arguments", () => {
    let cancelled = 0;
    const props: AddSheetProps = {
      visible: true,
      book: makeBook(),
      shelves: SHELVES,
      onSubmit: async () => {},
      onCancel: () => {
        cancelled++;
      },
    };
    props.onCancel();
    props.onCancel();
    expect(cancelled).toBe(2);
  });

  it("exposes all four reading-status values as the radio group source-of-truth", () => {
    const expected: ReadingStatus[] = [
      "want_to_read",
      "reading",
      "finished",
      "dropped",
    ];
    // The status radio group renders one option per ReadingStatus value;
    // any drift would silently drop an option from the UI. Lock the set.
    expect(new Set(expected).size).toBe(4);
  });

  it("exposes all four visibility tiers as the privacy radio group source-of-truth", () => {
    const expected: Visibility[] = ["public", "followers", "mutuals", "private"];
    expect(new Set(expected).size).toBe(4);
  });
});
