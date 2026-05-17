import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ManualBookForm } from "./ManualBookForm";

describe("ManualBookForm rendering (G-05, #79)", () => {
  it("renders a form with the required testid", () => {
    const html = renderToStaticMarkup(
      <ManualBookForm onSubmit={async () => {}} />,
    );
    expect(html).toContain('data-testid="manual-book-form"');
    expect(html).toMatch(/<form[^>]+class="manualBookForm"/);
  });

  it("renders Title, ISBN, year, and cover URL inputs", () => {
    const html = renderToStaticMarkup(
      <ManualBookForm onSubmit={async () => {}} />,
    );
    expect(html).toContain('data-testid="manual-book-title"');
    expect(html).toContain('data-testid="manual-book-isbn"');
    expect(html).toContain('data-testid="manual-book-year"');
    expect(html).toContain('data-testid="manual-book-cover"');
  });

  it("renders the title input as required", () => {
    const html = renderToStaticMarkup(
      <ManualBookForm onSubmit={async () => {}} />,
    );
    expect(html).toMatch(
      /aria-required="true"[^>]*data-testid="manual-book-title"/,
    );
    // The visible <label> carries a "*" marker for the required affordance.
    expect(html).toMatch(/Title<span[^>]*>\s*\*\s*<\/span>/);
  });

  it("renders one author input by default", () => {
    const html = renderToStaticMarkup(
      <ManualBookForm onSubmit={async () => {}} />,
    );
    expect(html).toContain('data-testid="manual-book-author-0"');
    expect(html).not.toContain('data-testid="manual-book-author-1"');
  });

  it("renders one author input per initialAuthors entry", () => {
    const html = renderToStaticMarkup(
      <ManualBookForm
        onSubmit={async () => {}}
        initialAuthors={["Ada Lovelace", "Grace Hopper", "Margaret Hamilton"]}
      />,
    );
    expect(html).toContain('data-testid="manual-book-author-0"');
    expect(html).toContain('data-testid="manual-book-author-1"');
    expect(html).toContain('data-testid="manual-book-author-2"');
    expect(html).toContain("Ada Lovelace");
    expect(html).toContain("Grace Hopper");
    expect(html).toContain("Margaret Hamilton");
  });

  it("renders an 'Add author' control", () => {
    const html = renderToStaticMarkup(
      <ManualBookForm onSubmit={async () => {}} />,
    );
    expect(html).toContain('data-testid="manual-book-author-add"');
    expect(html).toMatch(/\+\s*Add author/);
  });

  it("renders a remove button for each author when there are 2+ authors", () => {
    const html = renderToStaticMarkup(
      <ManualBookForm
        onSubmit={async () => {}}
        initialAuthors={["Ada", "Grace"]}
      />,
    );
    expect(html).toContain('data-testid="manual-book-author-remove-0"');
    expect(html).toContain('data-testid="manual-book-author-remove-1"');
  });

  it("does not render a remove button when there is only one author", () => {
    const html = renderToStaticMarkup(
      <ManualBookForm onSubmit={async () => {}} initialAuthors={["Solo"]} />,
    );
    expect(html).not.toContain('data-testid="manual-book-author-remove-0"');
  });

  it("renders the submit button disabled when title is empty", () => {
    const html = renderToStaticMarkup(
      <ManualBookForm onSubmit={async () => {}} />,
    );
    expect(html).toMatch(
      /disabled[^>]*data-testid="manual-book-submit"/,
    );
  });

  it("renders the submit button enabled when title and at least one author are present", () => {
    const html = renderToStaticMarkup(
      <ManualBookForm
        onSubmit={async () => {}}
        initialTitle="Foundation"
        initialAuthors={["Isaac Asimov"]}
      />,
    );
    // Disabled would render as `disabled=""` (or `disabled`); ensure it
    // does NOT appear on the submit button.
    expect(html).not.toMatch(
      /disabled[^>]*data-testid="manual-book-submit"/,
    );
  });

  it("renders the submit button disabled when authors are blank even with a title", () => {
    const html = renderToStaticMarkup(
      <ManualBookForm
        onSubmit={async () => {}}
        initialTitle="Foundation"
        initialAuthors={["", "   "]}
      />,
    );
    expect(html).toMatch(
      /disabled[^>]*data-testid="manual-book-submit"/,
    );
  });

  it("marks optional fields visually with '(optional)'", () => {
    const html = renderToStaticMarkup(
      <ManualBookForm onSubmit={async () => {}} />,
    );
    // Each of ISBN, year, cover URL labels carry an "(optional)" hint.
    const optionalMatches = html.match(/\(optional\)/g) ?? [];
    expect(optionalMatches.length).toBeGreaterThanOrEqual(3);
  });

  it("uses type=number on the year input with bounds 0-9999", () => {
    const html = renderToStaticMarkup(
      <ManualBookForm onSubmit={async () => {}} />,
    );
    // React orders JSX attributes by source order; type="number" appears
    // before data-testid="manual-book-year" in the rendered HTML.
    expect(html).toMatch(
      /type="number"[^>]*data-testid="manual-book-year"/,
    );
    expect(html).toMatch(/min="0"/);
    expect(html).toMatch(/max="9999"/);
  });

  it("uses type=url on the cover input", () => {
    const html = renderToStaticMarkup(
      <ManualBookForm onSubmit={async () => {}} />,
    );
    expect(html).toMatch(/type="url"[^>]*data-testid="manual-book-cover"/);
  });

  it("populates initial values into their inputs", () => {
    const html = renderToStaticMarkup(
      <ManualBookForm
        onSubmit={async () => {}}
        initialTitle="Dune"
        initialAuthors={["Frank Herbert"]}
        initialIsbn="9780441013593"
        initialYear="1965"
        initialCoverUrl="https://example.com/dune.jpg"
      />,
    );
    expect(html).toMatch(/data-testid="manual-book-title"[^>]*value="Dune"/);
    expect(html).toMatch(
      /data-testid="manual-book-author-0"[^>]*value="Frank Herbert"/,
    );
    expect(html).toMatch(
      /data-testid="manual-book-isbn"[^>]*value="9780441013593"/,
    );
    expect(html).toMatch(/data-testid="manual-book-year"[^>]*value="1965"/);
    expect(html).toMatch(
      /data-testid="manual-book-cover"[^>]*value="https:\/\/example.com\/dune.jpg"/,
    );
  });

  it("collapses initialAuthors=[] into a single empty author input", () => {
    const html = renderToStaticMarkup(
      <ManualBookForm onSubmit={async () => {}} initialAuthors={[]} />,
    );
    expect(html).toContain('data-testid="manual-book-author-0"');
    expect(html).not.toContain('data-testid="manual-book-author-1"');
  });

  it("renders accessible labels for each field", () => {
    const html = renderToStaticMarkup(
      <ManualBookForm onSubmit={async () => {}} />,
    );
    expect(html).toContain('for="manual-book-title"');
    expect(html).toContain('for="manual-book-isbn"');
    expect(html).toContain('for="manual-book-year"');
    expect(html).toContain('for="manual-book-cover"');
    // Authors uses a fieldset/legend with aria-label per input.
    expect(html).toContain('aria-label="Author 1"');
  });
});
