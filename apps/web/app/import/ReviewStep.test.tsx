import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { EntityId } from "@hone/domain";
import { ReviewStep, __testing } from "./ReviewStep";
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
    candidateTitle: "Hyperion (Cantos #1)",
    candidateAuthor: "Dan Simmons",
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
    rowId: "u1",
    bucket: "unmatched",
    title: "Obscure Tome",
    author: "Anon.",
    goodreadsStatus: "want_to_read",
  },
];

const DECISIONS: RowDecisionMap = {
  m1: { apply: true, overwriteConflict: false },
  n1: { apply: false, overwriteConflict: false },
  c1: { apply: false, overwriteConflict: false },
  u1: { apply: false, overwriteConflict: false },
};

describe("ReviewStep (K-07, #106)", () => {
  it("renders all four bucket sections, in the spec order", () => {
    const html = renderToStaticMarkup(
      <ReviewStep
        rows={ROWS}
        decisions={DECISIONS}
        onDecisionChange={() => {}}
        onContinue={() => {}}
        onCancel={() => {}}
      />,
    );
    for (const bucket of __testing.BUCKET_ORDER) {
      expect(html).toContain(`data-testid="import-bucket-${bucket}"`);
    }
    // Spec order: matched < needs_review < conflict < unmatched.
    const matchedIdx = html.indexOf('data-testid="import-bucket-matched"');
    const reviewIdx = html.indexOf(
      'data-testid="import-bucket-needs_review"',
    );
    const conflictIdx = html.indexOf('data-testid="import-bucket-conflict"');
    const unmatchedIdx = html.indexOf(
      'data-testid="import-bucket-unmatched"',
    );
    expect(matchedIdx).toBeLessThan(reviewIdx);
    expect(reviewIdx).toBeLessThan(conflictIdx);
    expect(conflictIdx).toBeLessThan(unmatchedIdx);
  });

  it("shows the row count per bucket", () => {
    const html = renderToStaticMarkup(
      <ReviewStep
        rows={ROWS}
        decisions={DECISIONS}
        onDecisionChange={() => {}}
        onContinue={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(html).toContain(
      'data-testid="import-bucket-matched-count">(1)',
    );
    expect(html).toContain(
      'data-testid="import-bucket-needs_review-count">(1)',
    );
    expect(html).toContain(
      'data-testid="import-bucket-conflict-count">(1)',
    );
    expect(html).toContain(
      'data-testid="import-bucket-unmatched-count">(1)',
    );
  });

  it("renders an apply checkbox for matched / needs_review / conflict rows", () => {
    const html = renderToStaticMarkup(
      <ReviewStep
        rows={ROWS}
        decisions={DECISIONS}
        onDecisionChange={() => {}}
        onContinue={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(html).toContain('data-testid="import-row-m1-apply"');
    expect(html).toContain('data-testid="import-row-n1-apply"');
    expect(html).toContain('data-testid="import-row-c1-apply"');
    // Unmatched rows render a manual-create link instead.
    expect(html).not.toContain('data-testid="import-row-u1-apply"');
    expect(html).toContain('data-testid="import-row-u1-create-manual"');
  });

  it("renders the overwrite-conflict checkbox only on conflict rows", () => {
    const html = renderToStaticMarkup(
      <ReviewStep
        rows={ROWS}
        decisions={DECISIONS}
        onDecisionChange={() => {}}
        onContinue={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(html).toContain('data-testid="import-row-c1-overwrite"');
    expect(html).not.toContain('data-testid="import-row-m1-overwrite"');
    expect(html).not.toContain('data-testid="import-row-n1-overwrite"');
  });

  it("renders a Continue button that triggers onContinue", () => {
    const html = renderToStaticMarkup(
      <ReviewStep
        rows={ROWS}
        decisions={DECISIONS}
        onDecisionChange={() => {}}
        onContinue={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(html).toContain('data-testid="import-review-continue"');
    expect(html).toContain('data-testid="import-review-cancel"');
  });

  it("handles an empty row list gracefully", () => {
    const html = renderToStaticMarkup(
      <ReviewStep
        rows={[]}
        decisions={{}}
        onDecisionChange={() => {}}
        onContinue={() => {}}
        onCancel={() => {}}
      />,
    );
    for (const bucket of __testing.BUCKET_ORDER) {
      expect(html).toContain(
        `data-testid="import-bucket-${bucket}-count">(0)`,
      );
    }
    expect(html).toMatch(/No rows in this bucket/);
  });

  it("renders a duplicate row inside the conflict bucket with no overwrite control", () => {
    const dupRow: ImportReviewRow = {
      rowId: "d1",
      bucket: "conflict",
      title: "1984",
      author: "George Orwell",
      goodreadsStatus: "finished",
      bookId: "00000000-0000-0000-0000-000000000099" as EntityId,
      currentHoneStatus: "finished",
      isDuplicate: true,
    };
    const decisions: RowDecisionMap = {
      d1: { apply: false, overwriteConflict: false },
    };
    const html = renderToStaticMarkup(
      <ReviewStep
        rows={[dupRow]}
        decisions={decisions}
        onDecisionChange={() => {}}
        onContinue={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(html).toContain('data-testid="import-bucket-conflict"');
    // Apply checkbox is rendered but disabled; no overwrite control at all.
    expect(html).toContain('data-testid="import-row-d1-apply"');
    expect(html).not.toContain('data-testid="import-row-d1-overwrite"');
    expect(html).toMatch(/Duplicate of an existing entry/);
  });
});
