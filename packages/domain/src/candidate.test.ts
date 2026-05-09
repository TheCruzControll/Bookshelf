import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { selectCandidate } from "./candidate";
import type { RankedCandidate } from "./candidate";

function makeCandidate(overrides: Partial<RankedCandidate> = {}): RankedCandidate {
  return {
    bookId: "00000000-0000-0000-0000-000000000001",
    position: 1,
    score: 5,
    bucket: 3,
    genres: [],
    ...overrides,
  };
}

describe("selectCandidate", () => {
  it("returns null when rankedBooks is empty", () => {
    expect(
      selectCandidate({ rankedBooks: [], targetBucket: 3, midpoint: 5, newBookGenres: [] })
    ).toBeNull();
  });

  it("returns the only candidate when there is one ranked book", () => {
    const book = makeCandidate({ bookId: "b1", position: 5, bucket: 3 });
    const result = selectCandidate({
      rankedBooks: [book],
      targetBucket: 3,
      midpoint: 5,
      newBookGenres: [],
    });
    expect(result?.bookId).toBe("b1");
  });

  it("prefers candidates in the same bucket as target", () => {
    const bucketMatch = makeCandidate({ bookId: "b-match", position: 10, bucket: 5 });
    const bucketOther = makeCandidate({ bookId: "b-other", position: 5, bucket: 3 });
    const result = selectCandidate({
      rankedBooks: [bucketMatch, bucketOther],
      targetBucket: 5,
      midpoint: 8,
      newBookGenres: [],
    });
    expect(result?.bookId).toBe("b-match");
  });

  it("falls back to all ranked books if no bucket match exists", () => {
    const book = makeCandidate({ bookId: "b1", position: 5, bucket: 2 });
    const result = selectCandidate({
      rankedBooks: [book],
      targetBucket: 5,
      midpoint: 5,
      newBookGenres: [],
    });
    expect(result?.bookId).toBe("b1");
  });

  it("prefers genre-overlapping candidates within the bucket", () => {
    const genreMatch = makeCandidate({ bookId: "genre-match", position: 8, bucket: 3, genres: ["fantasy", "adventure"] });
    const noGenre = makeCandidate({ bookId: "no-genre", position: 7, bucket: 3, genres: [] });
    const result = selectCandidate({
      rankedBooks: [genreMatch, noGenre],
      targetBucket: 3,
      midpoint: 7,
      newBookGenres: ["fantasy"],
    });
    expect(result?.bookId).toBe("genre-match");
  });

  it("falls back to bucket pool globally when genre overlap is empty", () => {
    const a = makeCandidate({ bookId: "a", position: 2, bucket: 4, genres: ["sci-fi"] });
    const b = makeCandidate({ bookId: "b", position: 8, bucket: 4, genres: ["thriller"] });
    const result = selectCandidate({
      rankedBooks: [a, b],
      targetBucket: 4,
      midpoint: 8,
      newBookGenres: ["fantasy"],
    });
    expect(result?.bookId).toBe("b");
  });

  it("selects the candidate closest to the midpoint", () => {
    const far = makeCandidate({ bookId: "far", position: 1, bucket: 3, genres: ["fantasy"] });
    const near = makeCandidate({ bookId: "near", position: 5, bucket: 3, genres: ["fantasy"] });
    const result = selectCandidate({
      rankedBooks: [far, near],
      targetBucket: 3,
      midpoint: 5,
      newBookGenres: ["fantasy"],
    });
    expect(result?.bookId).toBe("near");
  });

  it("uses global pool when no bucket match, prefers genre overlap", () => {
    const genreMatch = makeCandidate({ bookId: "gm", position: 10, bucket: 1, genres: ["mystery"] });
    const noMatch = makeCandidate({ bookId: "nm", position: 9, bucket: 2, genres: ["horror"] });
    const result = selectCandidate({
      rankedBooks: [genreMatch, noMatch],
      targetBucket: 5,
      midpoint: 10,
      newBookGenres: ["mystery"],
    });
    expect(result?.bookId).toBe("gm");
  });

  it("genre matching is case-insensitive", () => {
    const a = makeCandidate({ bookId: "a", position: 5, bucket: 3, genres: ["Fantasy"] });
    const b = makeCandidate({ bookId: "b", position: 5, bucket: 3, genres: ["thriller"] });
    const result = selectCandidate({
      rankedBooks: [a, b],
      targetBucket: 3,
      midpoint: 5,
      newBookGenres: ["fantasy"],
    });
    expect(result?.bookId).toBe("a");
  });

  it("when newBookGenres is empty, no genre filtering applied", () => {
    const a = makeCandidate({ bookId: "a", position: 3, bucket: 3, genres: ["sci-fi"] });
    const b = makeCandidate({ bookId: "b", position: 5, bucket: 3, genres: ["fantasy"] });
    const result = selectCandidate({
      rankedBooks: [a, b],
      targetBucket: 3,
      midpoint: 5,
      newBookGenres: [],
    });
    expect(result?.bookId).toBe("b");
  });
});

describe("selectCandidate property tests", () => {
  const candidateArb = fc.record({
    bookId: fc.uuid(),
    position: fc.integer({ min: 1, max: 1000 }),
    score: fc.float({ min: 0, max: 10, noNaN: true }),
    bucket: fc.integer({ min: 1, max: 5 }),
    genres: fc.array(fc.constantFrom("fantasy", "sci-fi", "mystery", "thriller", "romance", "horror"), { maxLength: 3 }),
  });

  it("always returns null iff rankedBooks is empty", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 100 }),
        fc.array(fc.string()),
        (targetBucket, midpoint, newBookGenres) => {
          const result = selectCandidate({ rankedBooks: [], targetBucket, midpoint, newBookGenres });
          return result === null;
        }
      )
    );
  });

  it("always returns a candidate from rankedBooks when list is non-empty", () => {
    fc.assert(
      fc.property(
        fc.array(candidateArb, { minLength: 1, maxLength: 20 }),
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 1000 }),
        fc.array(fc.constantFrom("fantasy", "sci-fi", "mystery"), { maxLength: 3 }),
        (rankedBooks, targetBucket, midpoint, newBookGenres) => {
          const result = selectCandidate({ rankedBooks, targetBucket, midpoint, newBookGenres });
          if (result === null) return false;
          return rankedBooks.some((b) => b.bookId === result.bookId);
        }
      )
    );
  });

  it("when bucket match exists, selected candidate always has matching bucket", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        fc.array(candidateArb, { minLength: 1, maxLength: 20 }),
        fc.integer({ min: 1, max: 1000 }),
        (targetBucket, rankedBooks, midpoint) => {
          const hasBucketMatch = rankedBooks.some((b) => b.bucket === targetBucket);
          if (!hasBucketMatch) return true;

          const result = selectCandidate({
            rankedBooks,
            targetBucket,
            midpoint,
            newBookGenres: [],
          });
          if (result === null) return false;

          const genreMatches = rankedBooks
            .filter((b) => b.bucket === targetBucket)
            .filter((b) => b.genres.length > 0 && false);

          if (genreMatches.length > 0) {
            return result.bucket === targetBucket;
          }
          return result.bucket === targetBucket;
        }
      )
    );
  });
});
