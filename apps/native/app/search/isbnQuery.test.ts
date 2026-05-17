import { describe, it, expect } from "vitest";
import {
  looksLikeIsbn,
  looksLikeIsbn10,
  looksLikeIsbn13,
  parseSearchQuery,
  stripIsbnFormatting,
} from "./isbnQuery";

describe("stripIsbnFormatting (native, G-03, #77)", () => {
  it("removes spaces and hyphens", () => {
    expect(stripIsbnFormatting("978-0-553-29335-0")).toBe("9780553293350");
    expect(stripIsbnFormatting("0 553 29335 4")).toBe("0553293354");
  });

  it("uppercases a trailing x check digit", () => {
    expect(stripIsbnFormatting("043942089x")).toBe("043942089X");
  });
});

describe("looksLikeIsbn13 (native, G-03, #77)", () => {
  it("accepts 13 plain digits", () => {
    expect(looksLikeIsbn13("9780553293357")).toBe(true);
  });

  it("accepts hyphenated and spaced ISBN-13", () => {
    expect(looksLikeIsbn13("978-0-553-29335-7")).toBe(true);
    expect(looksLikeIsbn13("978 0 553 29335 7")).toBe(true);
  });

  it("rejects shorter / longer / non-digit input", () => {
    expect(looksLikeIsbn13("123")).toBe(false);
    expect(looksLikeIsbn13("12345678901234")).toBe(false);
    expect(looksLikeIsbn13("978055329335X")).toBe(false);
  });
});

describe("looksLikeIsbn10 (native, G-03, #77)", () => {
  it("accepts 10 plain digits", () => {
    expect(looksLikeIsbn10("0553293354")).toBe(true);
  });

  it("accepts ISBN-10 with trailing X check digit", () => {
    expect(looksLikeIsbn10("043942089X")).toBe(true);
    expect(looksLikeIsbn10("043942089x")).toBe(true);
  });

  it("accepts hyphenated ISBN-10", () => {
    expect(looksLikeIsbn10("0-553-29335-4")).toBe(true);
  });

  it("rejects strings of the wrong length or shape", () => {
    expect(looksLikeIsbn10("abcdefghij")).toBe(false);
    expect(looksLikeIsbn10("055329335")).toBe(false);
    expect(looksLikeIsbn10("9780553293354")).toBe(false);
  });
});

describe("looksLikeIsbn (native, G-03, #77)", () => {
  it("returns true for both ISBN-10 and ISBN-13 shapes", () => {
    expect(looksLikeIsbn("0553293354")).toBe(true);
    expect(looksLikeIsbn("9780553293357")).toBe(true);
  });

  it("returns false for free-text queries", () => {
    expect(looksLikeIsbn("Foundation")).toBe(false);
    expect(looksLikeIsbn("Asimov")).toBe(false);
    expect(looksLikeIsbn("the fifth season")).toBe(false);
  });
});

describe("parseSearchQuery (native, G-03, #77)", () => {
  it("classifies whitespace as empty", () => {
    expect(parseSearchQuery("")).toEqual({ kind: "empty" });
    expect(parseSearchQuery("   ")).toEqual({ kind: "empty" });
  });

  it("routes ISBN-13 input to the isbn branch with formatting stripped", () => {
    expect(parseSearchQuery("978-0-553-29335-7")).toEqual({
      kind: "isbn",
      isbn: "9780553293357",
    });
  });

  it("routes ISBN-10 input (with optional X) to the isbn branch", () => {
    expect(parseSearchQuery("043942089X")).toEqual({
      kind: "isbn",
      isbn: "043942089X",
    });
    expect(parseSearchQuery("0-553-29335-4")).toEqual({
      kind: "isbn",
      isbn: "0553293354",
    });
  });

  it("routes title/author input to the text branch with trimmed value", () => {
    expect(parseSearchQuery("  Foundation  ")).toEqual({
      kind: "text",
      query: "Foundation",
    });
    expect(parseSearchQuery("Isaac Asimov")).toEqual({
      kind: "text",
      query: "Isaac Asimov",
    });
  });
});
