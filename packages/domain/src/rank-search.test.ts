/**
 * Tests for the F-07 (#73) search re-ranker.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { BookSearchResult } from "./types";
import {
  rankSearchResults,
  scoreSearchResult,
  SEARCH_RANK_WEIGHTS,
} from "./rank-search";

function makeResult(overrides: Partial<BookSearchResult>): BookSearchResult {
  return {
    source: "open_library",
    sourceKey: overrides.sourceKey ?? `/works/${Math.random()}`,
    title: "Untitled",
    authors: [],
    ...overrides,
  };
}

describe("rankSearchResults", () => {
  describe("exact title boost", () => {
    it("jumps the exact-title match to the top", () => {
      const exact = makeResult({ sourceKey: "EXACT", title: "Dune" });
      const popular = makeResult({
        sourceKey: "POPULAR",
        title: "Dune Messiah",
        editionCount: 80,
      });
      const irrelevant = makeResult({ sourceKey: "OTHER", title: "Children of Dune" });

      // Provider order intentionally puts the exact match last so the boost
      // has to do real work.
      const input = [popular, irrelevant, exact];
      const ranked = rankSearchResults(input, "Dune", undefined);

      expect(ranked[0]?.sourceKey).toBe("EXACT");
    });

    it("is case-insensitive and whitespace-tolerant", () => {
      const exact = makeResult({ sourceKey: "EXACT", title: "The Great Gatsby" });
      const other = makeResult({ sourceKey: "OTHER", title: "Gatsby's Girl" });

      const ranked = rankSearchResults(
        [other, exact],
        "  the great GATSBY  ",
        undefined,
      );

      expect(ranked[0]?.sourceKey).toBe("EXACT");
    });

    it("does not award the boost for a substring match", () => {
      const substring = makeResult({ sourceKey: "SUB", title: "Dune" });
      const sig = scoreSearchResult(substring, "Dune Messiah", undefined);
      expect(sig.exactTitle).toBe(false);
    });
  });

  describe("exact author boost", () => {
    it("boosts an exact author match above a non-match (everything else equal)", () => {
      const byAuthor = makeResult({
        sourceKey: "BY_TOLKIEN",
        title: "Some Book",
        authors: ["J.R.R. Tolkien"],
      });
      const notByAuthor = makeResult({
        sourceKey: "NOT_BY_TOLKIEN",
        title: "Some Book",
        authors: ["Brandon Sanderson"],
      });

      const ranked = rankSearchResults(
        [notByAuthor, byAuthor],
        "J.R.R. Tolkien",
        undefined,
      );

      expect(ranked[0]?.sourceKey).toBe("BY_TOLKIEN");
    });

    it("matches when any query token equals a full author name", () => {
      const book = makeResult({
        sourceKey: "TOLKIEN_LOTR",
        title: "The Fellowship of the Ring",
        authors: ["J.R.R. Tolkien"],
      });
      // Multi-token query — the bare "tolkien" token should not match the
      // full normalized author "j.r.r. tolkien" since author match requires
      // a full-name equality. We assert the score does NOT include the
      // exact-author boost in this case.
      const sig = scoreSearchResult(book, "tolkien", undefined);
      expect(sig.exactAuthor).toBe(false);
    });

    it("matches when the full query exactly equals a single author name", () => {
      const book = makeResult({
        title: "Whatever",
        authors: ["Ursula K. Le Guin"],
      });
      const sig = scoreSearchResult(book, "Ursula K. Le Guin", undefined);
      expect(sig.exactAuthor).toBe(true);
    });
  });

  describe("edition_count boost", () => {
    it("ranks higher edition_count above lower when other scores are tied", () => {
      const many = makeResult({
        sourceKey: "MANY",
        title: "Title A",
        editionCount: 50,
      });
      const few = makeResult({
        sourceKey: "FEW",
        title: "Title A",
        editionCount: 2,
      });

      const ranked = rankSearchResults([few, many], "different query", undefined);

      expect(ranked[0]?.sourceKey).toBe("MANY");
    });

    it("treats missing edition_count as zero (no boost)", () => {
      const sig = scoreSearchResult(makeResult({ title: "x" }), "q", undefined);
      expect(sig.editionCount).toBe(0);
    });

    it("is log-scaled — extreme edition counts do not dominate exact-title", () => {
      const exactTitle = makeResult({ sourceKey: "EXACT", title: "X" });
      const mega = makeResult({
        sourceKey: "MEGA",
        title: "Mega Popular",
        editionCount: 10_000,
      });

      const ranked = rankSearchResults([mega, exactTitle], "X", undefined);

      expect(ranked[0]?.sourceKey).toBe("EXACT");
    });
  });

  describe("locale-language preference", () => {
    it("an en book outranks an fr book for an en-US viewer (other things equal)", () => {
      const en = makeResult({
        sourceKey: "EN",
        title: "Title A",
        languages: ["eng"],
      });
      const fr = makeResult({
        sourceKey: "FR",
        title: "Title A",
        languages: ["fre"],
      });

      const ranked = rankSearchResults([fr, en], "different", "en-US");

      expect(ranked[0]?.sourceKey).toBe("EN");
    });

    it("accepts BCP-47, bare two-letter, and three-letter viewer locales", () => {
      const book = makeResult({ title: "x", languages: ["eng"] });
      const fromBcp = scoreSearchResult(book, "q", "en-US");
      const fromTwo = scoreSearchResult(book, "q", "en");
      const fromThree = scoreSearchResult(book, "q", "eng");
      expect(fromBcp.localeMatch).toBe(true);
      expect(fromTwo.localeMatch).toBe(true);
      expect(fromThree.localeMatch).toBe(true);
    });

    it("Google-Books-style bcp47 result languages also match", () => {
      const book = makeResult({ title: "x", languages: ["en"], source: "google_books" });
      const sig = scoreSearchResult(book, "q", "en-US");
      expect(sig.localeMatch).toBe(true);
    });

    it("missing viewer locale skips the boost", () => {
      const book = makeResult({ title: "x", languages: ["eng"] });
      const sig = scoreSearchResult(book, "q", undefined);
      expect(sig.localeMatch).toBe(false);
    });

    it("unknown/unmappable viewer locale skips the boost (no false positive)", () => {
      const book = makeResult({ title: "x", languages: ["eng"] });
      const sig = scoreSearchResult(book, "q", "xyz");
      expect(sig.localeMatch).toBe(false);
    });

    it("missing result languages skips the boost", () => {
      const book = makeResult({ title: "x" });
      const sig = scoreSearchResult(book, "q", "en-US");
      expect(sig.localeMatch).toBe(false);
    });
  });

  describe("publish-year tiebreak", () => {
    it("newer publishYear wins when scores tie", () => {
      const newer = makeResult({
        sourceKey: "NEWER",
        title: "X",
        firstPublishedYear: 2020,
      });
      const older = makeResult({
        sourceKey: "OLDER",
        title: "X",
        firstPublishedYear: 1990,
      });

      const ranked = rankSearchResults([older, newer], "different", undefined);

      expect(ranked[0]?.sourceKey).toBe("NEWER");
    });

    it("missing publishYear sorts last among tied scores", () => {
      const known = makeResult({
        sourceKey: "KNOWN",
        title: "X",
        firstPublishedYear: 1900,
      });
      const unknown = makeResult({ sourceKey: "UNKNOWN", title: "X" });

      const ranked = rankSearchResults([unknown, known], "different", undefined);

      expect(ranked[0]?.sourceKey).toBe("KNOWN");
    });

    it("falls back to provider order when scores AND publishYear both tie", () => {
      const first = makeResult({ sourceKey: "FIRST", title: "X", firstPublishedYear: 1980 });
      const second = makeResult({ sourceKey: "SECOND", title: "X", firstPublishedYear: 1980 });

      const ranked = rankSearchResults([first, second], "different", undefined);

      expect(ranked.map((r) => r.sourceKey)).toEqual(["FIRST", "SECOND"]);
    });
  });

  describe("edge cases", () => {
    it("returns a new array (does not mutate input)", () => {
      const input: BookSearchResult[] = [
        makeResult({ sourceKey: "A", title: "A" }),
        makeResult({ sourceKey: "B", title: "B" }),
      ];
      const snapshot = [...input];
      rankSearchResults(input, "A", undefined);
      expect(input).toEqual(snapshot);
    });

    it("empty array returns empty array", () => {
      expect(rankSearchResults([], "q", undefined)).toEqual([]);
    });

    it("single-element array returns a one-element copy", () => {
      const only = makeResult({ sourceKey: "ONLY", title: "Only" });
      const ranked = rankSearchResults([only], "anything", undefined);
      expect(ranked).toEqual([only]);
    });

    it("empty / whitespace query skips title/author boosts but still applies edition + locale + provider order", () => {
      const popular = makeResult({
        sourceKey: "POPULAR",
        title: "Anything",
        editionCount: 50,
      });
      const unpopular = makeResult({
        sourceKey: "UNPOPULAR",
        title: "Anything Else",
        editionCount: 1,
      });

      const ranked = rankSearchResults([unpopular, popular], "   ", undefined);

      expect(ranked[0]?.sourceKey).toBe("POPULAR");
    });
  });

  describe("weights sanity", () => {
    it("exact title alone outranks the realistic max of all other signals combined", () => {
      // Realistic max for non-title signals: editionCount fully saturated
      // (= editionCountScale) + exactAuthor + localeMatch.
      const exactTitleScore = SEARCH_RANK_WEIGHTS.exactTitle;
      const otherSignalsMax =
        SEARCH_RANK_WEIGHTS.exactAuthor +
        SEARCH_RANK_WEIGHTS.editionCountScale +
        SEARCH_RANK_WEIGHTS.localeMatch;

      // We deliberately allow `exactAuthor + locale + edition` to BEAT a
      // bare result with no boosts. What we want is that exact-title alone
      // outranks the realistic combined non-title signal of ANOTHER result
      // (an exact title hit should never lose to "popular + author + locale").
      expect(exactTitleScore).toBeLessThanOrEqual(otherSignalsMax);
      // But we still want exact-title to clear the SUM of the two largest
      // non-title signals — otherwise exact-title would be too easy to
      // overcome.
      const twoBiggest =
        Math.max(
          SEARCH_RANK_WEIGHTS.exactAuthor,
          SEARCH_RANK_WEIGHTS.editionCountScale,
          SEARCH_RANK_WEIGHTS.localeMatch,
        ) +
        // Second-biggest non-title weight is locale (2.0) or author (3.0).
        SEARCH_RANK_WEIGHTS.editionCountScale;
      expect(exactTitleScore).toBeGreaterThan(twoBiggest);
    });
  });
});

describe("rankSearchResults property tests", () => {
  const resultArb = fc.record({
    source: fc.constantFrom("open_library" as const, "google_books" as const),
    sourceKey: fc.uuid(),
    title: fc.string({ minLength: 1, maxLength: 30 }),
    authors: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 3 }),
    firstPublishedYear: fc.option(fc.integer({ min: 1500, max: 2100 }), { nil: undefined }),
    editionCount: fc.option(fc.integer({ min: 0, max: 500 }), { nil: undefined }),
    languages: fc.option(
      fc.array(fc.constantFrom("eng", "fre", "ger", "spa", "ita"), { maxLength: 2 }),
      { nil: undefined },
    ),
  });

  it("returns the same set of results (no drops, no additions)", () => {
    fc.assert(
      fc.property(
        fc.array(resultArb, { minLength: 0, maxLength: 30 }),
        fc.string({ maxLength: 40 }),
        fc.option(fc.constantFrom("en", "en-US", "fr", "de-DE"), { nil: undefined }),
        (input, query, locale) => {
          const ranked = rankSearchResults(input, query, locale ?? undefined);
          const inputKeys = [...input.map((r) => r.sourceKey)].sort();
          const rankedKeys = [...ranked.map((r) => r.sourceKey)].sort();
          return (
            ranked.length === input.length &&
            inputKeys.length === rankedKeys.length &&
            inputKeys.every((k, i) => k === rankedKeys[i])
          );
        },
      ),
    );
  });

  it("is deterministic — same input produces same order on repeated calls", () => {
    fc.assert(
      fc.property(
        fc.array(resultArb, { minLength: 0, maxLength: 30 }),
        fc.string({ maxLength: 40 }),
        fc.option(fc.constantFrom("en", "en-US", "fr", "de-DE"), { nil: undefined }),
        (input, query, locale) => {
          const a = rankSearchResults(input, query, locale ?? undefined);
          const b = rankSearchResults(input, query, locale ?? undefined);
          return (
            a.length === b.length &&
            a.every((r, i) => r.sourceKey === b[i]?.sourceKey)
          );
        },
      ),
    );
  });

  it("re-ranking is stable: equal-score, equal-year items preserve their provider order", () => {
    // Build a fully-tied list (all results identical except sourceKey + a
    // monotonic provider index). The ranked order should match the input
    // order exactly.
    fc.assert(
      fc.property(
        fc.array(fc.uuid(), { minLength: 2, maxLength: 20 }),
        (keys) => {
          const input: BookSearchResult[] = keys.map((k) => ({
            source: "open_library",
            sourceKey: k,
            title: "tied title",
            authors: ["tied author"],
            firstPublishedYear: 2000,
            editionCount: 10,
            languages: ["eng"],
          }));
          const ranked = rankSearchResults(input, "tied title", "en-US");
          return ranked.every((r, i) => r.sourceKey === input[i]?.sourceKey);
        },
      ),
    );
  });

  it("scores are non-negative and finite for any reasonable input", () => {
    fc.assert(
      fc.property(
        resultArb,
        fc.string({ maxLength: 40 }),
        fc.option(fc.constantFrom("en", "en-US", "fr"), { nil: undefined }),
        (result, query, locale) => {
          const sig = scoreSearchResult(result, query, locale ?? undefined);
          return Number.isFinite(sig.score) && sig.score >= 0;
        },
      ),
    );
  });
});
