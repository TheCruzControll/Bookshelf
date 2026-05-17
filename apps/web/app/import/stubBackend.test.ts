import { describe, it, expect } from "vitest";
import { STUB_IMPORT_BACKEND, STUB_PARSE_RESULT } from "./stubBackend";

describe("STUB_IMPORT_BACKEND (K-07, #106)", () => {
  it("parseAndMatch returns the canned five-row preview", async () => {
    const result = await STUB_IMPORT_BACKEND.parseAndMatch("title,author");
    expect(result).toEqual(STUB_PARSE_RESULT);
    expect(result.rows).toHaveLength(5);
  });

  it("STUB_PARSE_RESULT exercises every bucket the UI renders", () => {
    const buckets = new Set(STUB_PARSE_RESULT.rows.map((r) => r.bucket));
    expect(buckets.has("matched")).toBe(true);
    expect(buckets.has("needs_review")).toBe(true);
    expect(buckets.has("conflict")).toBe(true);
    expect(buckets.has("unmatched")).toBe(true);
  });

  it("commit aggregates apply=true / false from the decision map", async () => {
    const result = await STUB_IMPORT_BACKEND.commit({
      importId: "imp_stub_0001",
      decisions: {
        a: { apply: true, overwriteConflict: false },
        b: { apply: false, overwriteConflict: false },
        c: { apply: true, overwriteConflict: true },
      },
    });
    expect(result.appliedCount).toBe(2);
    expect(result.skippedCount).toBe(1);
  });
});
