import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  levenshtein,
  normalizeForMatch,
  extractSurname,
} from "./levenshtein";

describe("levenshtein", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshtein("", "")).toBe(0);
    expect(levenshtein("abc", "abc")).toBe(0);
  });

  it("returns the length of the other string when one is empty", () => {
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("hello", "")).toBe(5);
  });

  it("counts single substitutions, insertions, and deletions", () => {
    expect(levenshtein("cat", "bat")).toBe(1); // substitution
    expect(levenshtein("cat", "cats")).toBe(1); // insertion
    expect(levenshtein("cats", "cat")).toBe(1); // deletion
  });

  it("handles transpositions as two operations", () => {
    expect(levenshtein("ab", "ba")).toBe(2);
  });

  it("classic kitten/sitting distance is 3", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
  });

  it("honors the early-exit max bound", () => {
    // Distance is 3, max=2 should short-circuit to 3 (max + 1).
    expect(levenshtein("kitten", "sitting", 2)).toBe(3);
    // Distance is 1, well under bound — exact value returned.
    expect(levenshtein("cat", "bat", 5)).toBe(1);
  });

  it("short-circuits via length-difference lower bound", () => {
    // Length diff alone exceeds bound — should return max+1 immediately.
    expect(levenshtein("a", "abcdefghij", 2)).toBe(3);
  });

  it("property: distance is symmetric", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (a, b) => {
        expect(levenshtein(a, b)).toBe(levenshtein(b, a));
      }),
    );
  });

  it("property: distance is zero iff strings are equal", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        expect(levenshtein(s, s)).toBe(0);
      }),
    );
  });

  it("property: distance is bounded by max(|a|,|b|)", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (a, b) => {
        const d = levenshtein(a, b);
        expect(d).toBeLessThanOrEqual(Math.max(a.length, b.length));
        expect(d).toBeGreaterThanOrEqual(Math.abs(a.length - b.length));
      }),
    );
  });

  it("property: triangle inequality", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 12 }),
        fc.string({ maxLength: 12 }),
        fc.string({ maxLength: 12 }),
        (a, b, c) => {
          const ab = levenshtein(a, b);
          const bc = levenshtein(b, c);
          const ac = levenshtein(a, c);
          expect(ac).toBeLessThanOrEqual(ab + bc);
        },
      ),
    );
  });

  it("property: bounded mode never under-reports an in-range distance", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 10 }),
        fc.string({ maxLength: 10 }),
        fc.integer({ min: 0, max: 10 }),
        (a, b, max) => {
          const exact = levenshtein(a, b);
          const bounded = levenshtein(a, b, max);
          if (exact <= max) {
            // In-bound distances must be reported exactly.
            expect(bounded).toBe(exact);
          } else {
            // Out-of-bound distances may return any value > max.
            expect(bounded).toBeGreaterThan(max);
          }
        },
      ),
    );
  });
});

describe("normalizeForMatch", () => {
  it("lowercases and trims", () => {
    expect(normalizeForMatch("  Hello World  ")).toBe("hello world");
  });

  it("collapses internal whitespace", () => {
    expect(normalizeForMatch("foo   bar\tbaz")).toBe("foo bar baz");
  });

  it("strips punctuation while preserving letters", () => {
    expect(normalizeForMatch("Mr. Mercedes: A Novel!")).toBe(
      "mr mercedes a novel",
    );
  });

  it("preserves Unicode letters", () => {
    expect(normalizeForMatch("Café Society")).toBe("café society");
  });
});

describe("extractSurname", () => {
  it("returns the last token in 'First Last'", () => {
    expect(extractSurname("Jane Austen")).toBe("austen");
  });

  it("returns the segment before the comma in 'Last, First'", () => {
    expect(extractSurname("Austen, Jane")).toBe("austen");
  });

  it("handles middle names", () => {
    expect(extractSurname("John Ronald Reuel Tolkien")).toBe("tolkien");
  });

  it("returns empty string for empty input", () => {
    expect(extractSurname("")).toBe("");
    expect(extractSurname("   ")).toBe("");
  });
});
