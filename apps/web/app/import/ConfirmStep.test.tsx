import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { EntityId } from "@hone/domain";
import { ConfirmStep, __testing } from "./ConfirmStep";
import type { ImportReviewRow, RowDecisionMap } from "./types";

const ROWS: ReadonlyArray<ImportReviewRow> = [
  {
    rowId: "m1",
    bucket: "matched",
    title: "Foundation",
    author: "Isaac Asimov",
    goodreadsStatus: "want_to_read",
    bookId: "00000000-0000-0000-0000-000000000001" as EntityId,
  },
  {
    rowId: "n1",
    bucket: "needs_review",
    title: "Hyperion",
    author: "Dan Simmons",
    goodreadsStatus: "want_to_read",
    bookId: "00000000-0000-0000-0000-000000000002" as EntityId,
  },
  {
    rowId: "c1",
    bucket: "conflict",
    title: "Dune",
    author: "Frank Herbert",
    goodreadsStatus: "finished",
    bookId: "00000000-0000-0000-0000-000000000003" as EntityId,
    currentHoneStatus: "reading",
  },
  {
    rowId: "d1",
    bucket: "conflict",
    title: "1984",
    author: "George Orwell",
    goodreadsStatus: "finished",
    bookId: "00000000-0000-0000-0000-000000000099" as EntityId,
    currentHoneStatus: "finished",
    isDuplicate: true,
  },
];

describe("ConfirmStep summarize() (K-07, #106)", () => {
  it("counts applied vs skipped from the decision map", () => {
    const decisions: RowDecisionMap = {
      m1: { apply: true, overwriteConflict: false },
      n1: { apply: false, overwriteConflict: false },
      c1: { apply: true, overwriteConflict: true },
      d1: { apply: false, overwriteConflict: false },
    };
    const result = __testing.summarize(ROWS, decisions);
    expect(result.applied).toBe(2);
    expect(result.skipped).toBe(2); // n1 + d1
    expect(result.overwrites).toBe(1);
    expect(result.duplicates).toBe(1);
  });

  it("treats missing decisions as skip", () => {
    const result = __testing.summarize(ROWS, {});
    expect(result.applied).toBe(0);
    expect(result.skipped).toBe(ROWS.length);
  });

  it("never counts a duplicate row as applied even if apply=true", () => {
    const decisions: RowDecisionMap = {
      d1: { apply: true, overwriteConflict: true },
    };
    const dupRow = ROWS[3];
    if (!dupRow) throw new Error("fixture missing duplicate row");
    const result = __testing.summarize([dupRow], decisions);
    expect(result.applied).toBe(0);
    expect(result.duplicates).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.overwrites).toBe(0);
  });
});

describe("ConfirmStep rendering (K-07, #106)", () => {
  it("renders a summary, a Back button, and a Commit submit button", () => {
    const html = renderToStaticMarkup(
      <ConfirmStep
        rows={ROWS}
        decisions={{
          m1: { apply: true, overwriteConflict: false },
          n1: { apply: false, overwriteConflict: false },
          c1: { apply: true, overwriteConflict: true },
          d1: { apply: false, overwriteConflict: false },
        }}
        submitting={false}
        onSubmit={() => {}}
        onBack={() => {}}
      />,
    );
    expect(html).toContain('data-testid="import-confirm-step"');
    expect(html).toContain('data-testid="import-confirm-applied">2');
    expect(html).toContain('data-testid="import-confirm-skipped">2');
    expect(html).toContain('data-testid="import-confirm-overwrites">1');
    expect(html).toContain('data-testid="import-confirm-duplicates">1');
    expect(html).toContain('data-testid="import-confirm-back"');
    expect(html).toContain('data-testid="import-confirm-submit"');
    expect(html).toContain("Commit import");
  });

  it("shows a Committing… label and disables both buttons while submitting", () => {
    const html = renderToStaticMarkup(
      <ConfirmStep
        rows={ROWS}
        decisions={{}}
        submitting={true}
        onSubmit={() => {}}
        onBack={() => {}}
      />,
    );
    expect(html).toContain("Committing");
    // React's SSR serializer renders `disabled` (boolean attribute) as
    // `disabled=""` immediately after the props it appears with in source
    // order. Match either ordering relative to the testid.
    expect(html).toMatch(
      /<button[^>]*disabled[^>]*data-testid="import-confirm-back"|<button[^>]*data-testid="import-confirm-back"[^>]*disabled/,
    );
    expect(html).toMatch(
      /<button[^>]*disabled[^>]*data-testid="import-confirm-submit"|<button[^>]*data-testid="import-confirm-submit"[^>]*disabled/,
    );
  });
});
