import { describe, it, expect } from "vitest";
import type { BooksCreateManualInput } from "@hone/domain";
import {
  MAX_AUTHORS,
  MAX_AUTHOR_LEN,
  MAX_COVER_LEN,
  MAX_TITLE_LEN,
  validateCoverUrl,
  validateIsbn,
  validateManualBookState,
  validateYear,
  type ManualBookFormState,
  type ManualBookSubmission,
} from "./validateManualBookState";

function makeState(
  overrides: Partial<ManualBookFormState> = {},
): ManualBookFormState {
  return {
    title: "Foundation",
    authors: ["Isaac Asimov"],
    isbn: "",
    year: "",
    coverUrl: "",
    ...overrides,
  };
}

describe("validateManualBookState — ManualBookSubmission ↔ schema parity (G-06, #80)", () => {
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

  it("exposes the same field-length caps the web validator uses", () => {
    expect(MAX_TITLE_LEN).toBe(500);
    expect(MAX_AUTHOR_LEN).toBe(200);
    expect(MAX_AUTHORS).toBe(20);
    expect(MAX_COVER_LEN).toBe(2048);
  });
});

describe("validateIsbn", () => {
  it("treats empty / whitespace as no input (no error)", () => {
    expect(validateIsbn("")).toEqual({});
    expect(validateIsbn("   ")).toEqual({});
  });

  it("accepts a valid ISBN-13", () => {
    const r = validateIsbn("9780553293357");
    expect(r.error).toBeUndefined();
    expect(r.value).toBe("9780553293357");
  });

  it("accepts a valid ISBN-10", () => {
    const r = validateIsbn("0306406152");
    expect(r.error).toBeUndefined();
    expect(r.value).toBe("0306406152");
  });

  it("tolerates hyphens and spaces in a valid ISBN", () => {
    const r = validateIsbn("978-0-553-29335-7");
    expect(r.error).toBeUndefined();
  });

  it("rejects an ISBN with a bad checksum", () => {
    const r = validateIsbn("9780306406158");
    expect(r.error).toMatch(/valid 10- or 13-digit ISBN/);
    expect(r.value).toBeUndefined();
  });

  it("rejects a too-short ISBN", () => {
    const r = validateIsbn("12345");
    expect(r.error).toBeDefined();
  });

  it("rejects non-numeric characters", () => {
    const r = validateIsbn("97803064061AB");
    expect(r.error).toBeDefined();
  });
});

describe("validateYear", () => {
  it("treats empty / whitespace as no input (no error)", () => {
    expect(validateYear("")).toEqual({});
    expect(validateYear("   ")).toEqual({});
  });

  it("accepts a positive integer within bounds", () => {
    expect(validateYear("1951")).toEqual({ value: 1951 });
    expect(validateYear("0")).toEqual({ value: 0 });
    expect(validateYear("9999")).toEqual({ value: 9999 });
  });

  it("rejects non-integers", () => {
    const r = validateYear("19.5");
    expect(r.error).toBeDefined();
  });

  it("rejects negative numbers", () => {
    const r = validateYear("-1");
    expect(r.error).toBeDefined();
  });

  it("rejects values above 9999", () => {
    const r = validateYear("10000");
    expect(r.error).toBeDefined();
  });

  it("rejects non-numeric input", () => {
    const r = validateYear("nineteen fifty-one");
    expect(r.error).toBeDefined();
  });
});

describe("validateCoverUrl", () => {
  it("treats empty / whitespace as no input (no error)", () => {
    expect(validateCoverUrl("")).toEqual({});
    expect(validateCoverUrl("   ")).toEqual({});
  });

  it("accepts an https URL", () => {
    const r = validateCoverUrl("https://example.com/cover.jpg");
    expect(r.error).toBeUndefined();
    expect(r.value).toBe("https://example.com/cover.jpg");
  });

  it("rejects a malformed URL", () => {
    const r = validateCoverUrl("not a url");
    expect(r.error).toBeDefined();
  });

  it("rejects an overly long URL", () => {
    const long = "https://example.com/" + "a".repeat(3000);
    const r = validateCoverUrl(long);
    expect(r.error).toMatch(/too long/i);
  });
});

describe("validateManualBookState — full matrix (G-06, #80 client validation)", () => {
  it("happy path: returns a valid payload with the right shape", () => {
    const r = validateManualBookState(
      makeState({
        title: "  Dune  ",
        authors: ["Frank Herbert", "  "],
        isbn: "978-0-553-29335-7",
        year: "1965",
        coverUrl: "https://example.com/dune.jpg",
      }),
    );
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual({});
    expect(r.payload).toEqual({
      title: "Dune",
      authors: ["Frank Herbert"],
      isbn: "978-0-553-29335-7",
      year: 1965,
      coverUrl: "https://example.com/dune.jpg",
    } satisfies ManualBookSubmission);
  });

  it("happy path: omits optional fields when blank", () => {
    const r = validateManualBookState(
      makeState({ title: "Dune", authors: ["Frank Herbert"] }),
    );
    expect(r.ok).toBe(true);
    expect(r.payload).toEqual({
      title: "Dune",
      authors: ["Frank Herbert"],
    });
    // Optional keys must be absent (not `undefined`) so the call shape
    // matches what `exactOptionalPropertyTypes`-style consumers expect.
    expect(r.payload && "isbn" in r.payload).toBe(false);
    expect(r.payload && "year" in r.payload).toBe(false);
    expect(r.payload && "coverUrl" in r.payload).toBe(false);
  });

  it("title empty: returns ok=false with a 'Title is required.' error", () => {
    const r = validateManualBookState(makeState({ title: "" }));
    expect(r.ok).toBe(false);
    expect(r.errors.title).toBe("Title is required.");
    expect(r.payload).toBeUndefined();
  });

  it("title whitespace-only: treated as empty", () => {
    const r = validateManualBookState(makeState({ title: "   " }));
    expect(r.ok).toBe(false);
    expect(r.errors.title).toBe("Title is required.");
  });

  it("title too long: returns a length error", () => {
    const r = validateManualBookState(
      makeState({ title: "a".repeat(501) }),
    );
    expect(r.ok).toBe(false);
    expect(r.errors.title).toMatch(/500 characters/);
  });

  it("authors empty: returns 'Add at least one author.'", () => {
    const r = validateManualBookState(makeState({ authors: [] }));
    expect(r.ok).toBe(false);
    expect(r.errors.authors).toBe("Add at least one author.");
  });

  it("authors all whitespace: returns 'Add at least one author.'", () => {
    const r = validateManualBookState(
      makeState({ authors: ["", "  ", "\t"] }),
    );
    expect(r.ok).toBe(false);
    expect(r.errors.authors).toBe("Add at least one author.");
  });

  it("authors over the cap: returns a 'too many' error", () => {
    const tooMany = Array.from({ length: 21 }, (_, i) => `Author ${i}`);
    const r = validateManualBookState(makeState({ authors: tooMany }));
    expect(r.ok).toBe(false);
    expect(r.errors.authors).toMatch(/At most 20/);
  });

  it("author name too long: returns a per-author length error", () => {
    const r = validateManualBookState(
      makeState({ authors: ["a".repeat(201)] }),
    );
    expect(r.ok).toBe(false);
    expect(r.errors.authors).toMatch(/200 characters/);
  });

  it("invalid ISBN: returns ok=false with an isbn error and no payload", () => {
    const r = validateManualBookState(makeState({ isbn: "12345" }));
    expect(r.ok).toBe(false);
    expect(r.errors.isbn).toBeDefined();
    expect(r.payload).toBeUndefined();
  });

  it("invalid year (negative): returns a year error", () => {
    const r = validateManualBookState(makeState({ year: "-1" }));
    expect(r.ok).toBe(false);
    expect(r.errors.year).toBeDefined();
  });

  it("invalid cover URL: returns a coverUrl error", () => {
    const r = validateManualBookState(
      makeState({ coverUrl: "not-a-url" }),
    );
    expect(r.ok).toBe(false);
    expect(r.errors.coverUrl).toBeDefined();
  });

  it("aggregates errors across multiple fields", () => {
    const r = validateManualBookState(
      makeState({
        title: "",
        authors: [],
        isbn: "12345",
        year: "x",
        coverUrl: "nope",
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.errors.title).toBeDefined();
    expect(r.errors.authors).toBeDefined();
    expect(r.errors.isbn).toBeDefined();
    expect(r.errors.year).toBeDefined();
    expect(r.errors.coverUrl).toBeDefined();
  });

  it("scrubs blank author entries before counting", () => {
    const r = validateManualBookState(
      makeState({ authors: ["", "Ursula K. Le Guin", "  "] }),
    );
    expect(r.ok).toBe(true);
    expect(r.payload?.authors).toEqual(["Ursula K. Le Guin"]);
  });

  it("trims title and authors in the emitted payload", () => {
    const r = validateManualBookState(
      makeState({ title: "  Foo  ", authors: ["  Bar  "] }),
    );
    expect(r.ok).toBe(true);
    expect(r.payload?.title).toBe("Foo");
    expect(r.payload?.authors).toEqual(["Bar"]);
  });
});
