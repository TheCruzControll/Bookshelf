import { describe, it, expect } from "vitest";
import {
  INITIAL_IMPORT_STATE,
  progressLabel,
  transition,
  type ImportState,
} from "./state";
import { STUB_PARSE_RESULT } from "./stubBackend";

describe("import state machine (K-07, #106)", () => {
  it("starts in the idle phase", () => {
    expect(INITIAL_IMPORT_STATE).toEqual({ phase: "idle" });
  });

  it("pick_file moves idle → uploading and records the file name", () => {
    const next = transition(INITIAL_IMPORT_STATE, {
      type: "pick_file",
      fileName: "goodreads_library_export.csv",
    });
    expect(next.phase).toBe("uploading");
    if (next.phase !== "uploading") throw new Error("narrow");
    expect(next.fileName).toBe("goodreads_library_export.csv");
  });

  it("begin_matching moves uploading → matching", () => {
    const after = transition(
      transition(INITIAL_IMPORT_STATE, {
        type: "pick_file",
        fileName: "x.csv",
      }),
      { type: "begin_matching" },
    );
    expect(after.phase).toBe("matching");
  });

  it("matched moves matching → review and carries the parse result", () => {
    let s: ImportState = INITIAL_IMPORT_STATE;
    s = transition(s, { type: "pick_file", fileName: "x.csv" });
    s = transition(s, { type: "begin_matching" });
    s = transition(s, { type: "matched", result: STUB_PARSE_RESULT });
    expect(s.phase).toBe("review");
    if (s.phase !== "review") throw new Error("narrow");
    expect(s.result.rows).toHaveLength(STUB_PARSE_RESULT.rows.length);
  });

  it("begin_commit and committed move review → committing → done", () => {
    let s: ImportState = INITIAL_IMPORT_STATE;
    s = transition(s, { type: "pick_file", fileName: "x.csv" });
    s = transition(s, { type: "begin_matching" });
    s = transition(s, { type: "matched", result: STUB_PARSE_RESULT });
    s = transition(s, { type: "begin_commit" });
    expect(s.phase).toBe("committing");
    s = transition(s, {
      type: "committed",
      summary: { appliedCount: 2, skippedCount: 3 },
    });
    expect(s.phase).toBe("done");
    if (s.phase !== "done") throw new Error("narrow");
    expect(s.summary.appliedCount).toBe(2);
  });

  it("ignores out-of-band events (e.g. matched while idle)", () => {
    const same = transition(INITIAL_IMPORT_STATE, {
      type: "matched",
      result: STUB_PARSE_RESULT,
    });
    expect(same).toBe(INITIAL_IMPORT_STATE);
  });

  it("fail moves any phase → error and preserves the file name when known", () => {
    let s: ImportState = INITIAL_IMPORT_STATE;
    s = transition(s, { type: "pick_file", fileName: "x.csv" });
    s = transition(s, { type: "fail", message: "boom" });
    expect(s.phase).toBe("error");
    if (s.phase !== "error") throw new Error("narrow");
    expect(s.fileName).toBe("x.csv");
    expect(s.message).toBe("boom");
  });

  it("fail from idle records a null file name", () => {
    const s = transition(INITIAL_IMPORT_STATE, {
      type: "fail",
      message: "nope",
    });
    expect(s.phase).toBe("error");
    if (s.phase !== "error") throw new Error("narrow");
    expect(s.fileName).toBeNull();
  });

  it("reset restores the initial state", () => {
    let s: ImportState = INITIAL_IMPORT_STATE;
    s = transition(s, { type: "pick_file", fileName: "x.csv" });
    s = transition(s, { type: "begin_matching" });
    s = transition(s, { type: "matched", result: STUB_PARSE_RESULT });
    s = transition(s, { type: "reset" });
    expect(s).toEqual(INITIAL_IMPORT_STATE);
  });

  it("progressLabel covers every phase with distinct copy", () => {
    const labels = new Set<string>();
    labels.add(progressLabel({ phase: "idle" }));
    labels.add(progressLabel({ phase: "uploading", fileName: "x.csv" }));
    labels.add(progressLabel({ phase: "matching", fileName: "x.csv" }));
    labels.add(
      progressLabel({
        phase: "review",
        fileName: "x.csv",
        result: STUB_PARSE_RESULT,
      }),
    );
    labels.add(
      progressLabel({
        phase: "committing",
        fileName: "x.csv",
        result: STUB_PARSE_RESULT,
      }),
    );
    labels.add(
      progressLabel({
        phase: "done",
        fileName: "x.csv",
        summary: { appliedCount: 1, skippedCount: 0 },
      }),
    );
    labels.add(
      progressLabel({ phase: "error", fileName: null, message: "x" }),
    );
    // 7 distinct phases → 7 distinct labels.
    expect(labels.size).toBe(7);
  });
});
