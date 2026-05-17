import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  BookSearchResultInput,
  EntityId,
} from "@hone/domain";
import { AddSheet, type ShelfOption } from "./AddSheet";

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
  { id: "00000000-0000-0000-0000-0000000000a1" as EntityId, name: "Reading", isSystem: true },
  { id: "00000000-0000-0000-0000-0000000000a2" as EntityId, name: "Want to Read", isSystem: true },
  { id: "00000000-0000-0000-0000-0000000000a3" as EntityId, name: "Finished", isSystem: true },
  { id: "00000000-0000-0000-0000-0000000000a4" as EntityId, name: "Dropped", isSystem: true },
  { id: "00000000-0000-0000-0000-0000000000a5" as EntityId, name: "Sci-fi favorites", isSystem: false },
];

describe("AddSheet rendering (G-02, #76)", () => {
  it("renders a dialog scaffold with the book title in the heading", () => {
    const html = renderToStaticMarkup(
      <AddSheet
        book={makeBook()}
        shelves={SHELVES}
        onSubmit={async () => {}}
        onCancel={() => {}}
      />,
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("Foundation");
    expect(html).toContain('data-testid="add-sheet"');
  });

  it("renders the four status radio inputs", () => {
    const html = renderToStaticMarkup(
      <AddSheet
        book={makeBook()}
        shelves={SHELVES}
        onSubmit={async () => {}}
        onCancel={() => {}}
      />,
    );
    for (const status of ["want_to_read", "reading", "finished", "dropped"]) {
      expect(html).toContain(`data-testid="add-sheet-status-${status}"`);
    }
    expect(html).toContain("Want to read");
    expect(html).toContain("Reading");
    expect(html).toContain("Finished");
    expect(html).toContain("Dropped");
  });

  it("renders the shelf <select> with every shelf option (plus a 'no shelf' fallback)", () => {
    const html = renderToStaticMarkup(
      <AddSheet
        book={makeBook()}
        shelves={SHELVES}
        onSubmit={async () => {}}
        onCancel={() => {}}
      />,
    );
    expect(html).toContain('data-testid="add-sheet-shelf"');
    expect(html).toContain("No specific shelf");
    for (const shelf of SHELVES) {
      expect(html).toContain(shelf.name);
      expect(html).toContain(`value="${shelf.id}"`);
    }
    // System shelves get a "(system)" suffix in the option label.
    expect(html).toMatch(/Reading\s*\(system\)/);
  });

  it("renders the four-tier privacy radio inputs", () => {
    const html = renderToStaticMarkup(
      <AddSheet
        book={makeBook()}
        shelves={SHELVES}
        onSubmit={async () => {}}
        onCancel={() => {}}
      />,
    );
    for (const tier of ["public", "followers", "mutuals", "private"]) {
      expect(html).toContain(`data-testid="add-sheet-visibility-${tier}"`);
    }
  });

  it("renders a note <textarea>", () => {
    const html = renderToStaticMarkup(
      <AddSheet
        book={makeBook()}
        shelves={SHELVES}
        onSubmit={async () => {}}
        onCancel={() => {}}
      />,
    );
    expect(html).toContain('data-testid="add-sheet-note"');
    expect(html).toContain("<textarea");
  });

  it("renders the Save button (submit) and Cancel button", () => {
    const html = renderToStaticMarkup(
      <AddSheet
        book={makeBook()}
        shelves={SHELVES}
        onSubmit={async () => {}}
        onCancel={() => {}}
      />,
    );
    expect(html).toContain('data-testid="add-sheet-save"');
    expect(html).toContain('type="submit"');
    expect(html).toContain(">Save<");
    expect(html).toContain(">Cancel<");
  });

  it("defaults status to want_to_read and visibility to followers", () => {
    const html = renderToStaticMarkup(
      <AddSheet
        book={makeBook()}
        shelves={SHELVES}
        onSubmit={async () => {}}
        onCancel={() => {}}
      />,
    );
    // checked={status === "want_to_read"} → checked attribute is present.
    expect(html).toMatch(
      /data-testid="add-sheet-status-want_to_read"[^>]*checked/,
    );
    expect(html).toMatch(
      /data-testid="add-sheet-visibility-followers"[^>]*checked/,
    );
  });

  it("honors initialStatus, initialVisibility, initialShelfId, and initialNote", () => {
    const html = renderToStaticMarkup(
      <AddSheet
        book={makeBook()}
        shelves={SHELVES}
        initialStatus="reading"
        initialVisibility="private"
        initialShelfId={SHELVES[0]!.id}
        initialNote="Bought used."
        onSubmit={async () => {}}
        onCancel={() => {}}
      />,
    );
    expect(html).toMatch(
      /data-testid="add-sheet-status-reading"[^>]*checked/,
    );
    expect(html).toMatch(
      /data-testid="add-sheet-visibility-private"[^>]*checked/,
    );
    expect(html).toContain("Bought used.");
  });
});
