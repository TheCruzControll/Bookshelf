import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ImportFlow } from "./ImportFlow";
import { STUB_IMPORT_BACKEND } from "./stubBackend";
import type {
  ImportBackend,
  CommitInput,
  CommitResult,
  ParseAndMatchResult,
} from "./types";

describe("ImportFlow first paint (K-07, #106)", () => {
  it("renders the upload step on initial mount (idle phase)", () => {
    const html = renderToStaticMarkup(
      <ImportFlow backend={STUB_IMPORT_BACKEND} />,
    );
    expect(html).toContain('data-testid="import-flow"');
    expect(html).toContain('data-testid="import-upload-step"');
    expect(html).toContain('data-testid="import-progress-label"');
    // Initial progress copy comes from the state-machine selector.
    expect(html).toContain("Pick a Goodreads CSV to begin.");
  });

  it("does not render review / confirm / progress UI before the user picks a file", () => {
    const html = renderToStaticMarkup(
      <ImportFlow backend={STUB_IMPORT_BACKEND} />,
    );
    expect(html).not.toContain('data-testid="import-review-step"');
    expect(html).not.toContain('data-testid="import-confirm-step"');
    expect(html).not.toContain('data-testid="import-progress-step"');
  });

  it("renders without an explicit backend prop (uses the stub default)", () => {
    const html = renderToStaticMarkup(<ImportFlow />);
    expect(html).toContain('data-testid="import-upload-step"');
  });
});

describe("ImportBackend contract (K-07, #106)", () => {
  it("accepts an alternative backend implementation (typecheck)", async () => {
    const calls: CommitInput[] = [];
    const result: ParseAndMatchResult = {
      importId: "imp_test",
      totalRows: 1,
      rows: [],
    };
    const fake: ImportBackend = {
      async parseAndMatch(_csv: string) {
        return result;
      },
      async commit(input: CommitInput): Promise<CommitResult> {
        calls.push(input);
        return { appliedCount: 0, skippedCount: 0 };
      },
    };
    const parsed = await fake.parseAndMatch("title,author");
    expect(parsed.importId).toBe("imp_test");
    const committed = await fake.commit({
      importId: parsed.importId,
      decisions: {
        a: { apply: true, overwriteConflict: false },
      },
    });
    expect(committed.appliedCount).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.decisions.a?.apply).toBe(true);
  });
});
