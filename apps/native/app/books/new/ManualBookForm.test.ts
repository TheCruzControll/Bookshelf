import { describe, it, expect } from "vitest";
import type { BooksCreateManualInput } from "@hone/domain";
import type {
  ManualBookFormProps,
  ManualBookSubmission,
} from "./ManualBookForm";
import { validateManualBookState } from "./validateManualBookState";

describe("ManualBookForm contract (native, G-06, #80)", () => {
  it("requires only onSubmit; everything else is optional", () => {
    const props: ManualBookFormProps = {
      onSubmit: async () => {},
    };
    expect(typeof props.onSubmit).toBe("function");
    expect(props.initialTitle).toBeUndefined();
    expect(props.initialAuthors).toBeUndefined();
    expect(props.initialIsbn).toBeUndefined();
    expect(props.initialYear).toBeUndefined();
    expect(props.initialCoverUrl).toBeUndefined();
  });

  it("accepts all five initial-value props", () => {
    const props: ManualBookFormProps = {
      onSubmit: async () => {},
      initialTitle: "Foundation",
      initialAuthors: ["Isaac Asimov", "Editor"],
      initialIsbn: "9780553293357",
      initialYear: "1951",
      initialCoverUrl: "https://example.com/foundation.jpg",
    };
    expect(props.initialTitle).toBe("Foundation");
    expect(props.initialAuthors).toEqual(["Isaac Asimov", "Editor"]);
    expect(props.initialIsbn).toBe("9780553293357");
    expect(props.initialYear).toBe("1951");
    expect(props.initialCoverUrl).toBe("https://example.com/foundation.jpg");
  });

  it("ManualBookSubmission matches BooksCreateManualInput exactly", () => {
    // Compile-time contract: if the type drifts, the cast fails.
    const submission: ManualBookSubmission = {
      title: "Foundation",
      authors: ["Isaac Asimov"],
      isbn: "9780553293357",
      year: 1951,
      coverUrl: "https://example.com/cover.jpg",
    };
    const asServer: BooksCreateManualInput = submission;
    expect(asServer.title).toBe("Foundation");
    expect(asServer.authors).toEqual(["Isaac Asimov"]);
  });

  it("onSubmit is awaited and may throw to surface a server error", async () => {
    const calls: ManualBookSubmission[] = [];
    const okProps: ManualBookFormProps = {
      onSubmit: async (submission) => {
        calls.push(submission);
      },
    };
    await okProps.onSubmit({ title: "Dune", authors: ["Frank Herbert"] });
    expect(calls).toHaveLength(1);

    const errProps: ManualBookFormProps = {
      onSubmit: async () => {
        throw new Error("bad request");
      },
    };
    await expect(
      errProps.onSubmit({ title: "x", authors: ["y"] }),
    ).rejects.toThrow("bad request");
  });

  it("form's submission contract: validator output is what onSubmit receives", async () => {
    // Lock in the contract that the form will call onSubmit with the
    // validator's `payload` shape (not with the raw form state). If we
    // ever refactor the form, this test makes the wiring explicit.
    const result = validateManualBookState({
      title: "Dune",
      authors: ["Frank Herbert"],
      isbn: "9780553293357",
      year: "1965",
      coverUrl: "https://example.com/dune.jpg",
    });
    expect(result.ok).toBe(true);
    const seen: ManualBookSubmission[] = [];
    const props: ManualBookFormProps = {
      onSubmit: async (submission) => {
        seen.push(submission);
      },
    };
    if (result.payload) {
      await props.onSubmit(result.payload);
    }
    expect(seen[0]).toEqual({
      title: "Dune",
      authors: ["Frank Herbert"],
      isbn: "9780553293357",
      year: 1965,
      coverUrl: "https://example.com/dune.jpg",
    });
  });
});
