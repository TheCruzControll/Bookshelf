import type { EntityId } from "./types";

export interface RankedCandidate {
  bookId: EntityId;
  position: number;
  score: number;
  bucket: number;
  genres: string[];
}

export interface SelectCandidateInput {
  rankedBooks: RankedCandidate[];
  targetBucket: number;
  midpoint: number;
  newBookGenres: string[];
}

function hasGenreOverlap(a: string[], b: string[]): boolean {
  const setA = new Set(a.map((g) => g.toLowerCase()));
  return b.some((g) => setA.has(g.toLowerCase()));
}

function closestToMidpoint(
  books: RankedCandidate[],
  midpoint: number
): RankedCandidate {
  return books.reduce((best, current) => {
    const bestDist = Math.abs(best.position - midpoint);
    const currentDist = Math.abs(current.position - midpoint);
    return currentDist < bestDist ? current : best;
  });
}

export function selectCandidate(
  input: SelectCandidateInput
): RankedCandidate | null {
  const { rankedBooks, targetBucket, midpoint, newBookGenres } = input;

  if (rankedBooks.length === 0) return null;

  const bucketNarrowed = rankedBooks.filter((b) => b.bucket === targetBucket);
  const pool = bucketNarrowed.length > 0 ? bucketNarrowed : rankedBooks;

  const genreMatches = pool.filter((b) =>
    newBookGenres.length > 0 && hasGenreOverlap(b.genres, newBookGenres)
  );

  const candidates = genreMatches.length > 0 ? genreMatches : pool;

  return closestToMidpoint(candidates, midpoint);
}
